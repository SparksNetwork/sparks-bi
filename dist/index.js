'use strict';

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

var _restify = require('restify');

var _restify2 = _interopRequireDefault(_restify);

var _firebase = require('firebase');

var _firebase2 = _interopRequireDefault(_firebase);

var _slackNode = require('slack-node');

var _slackNode2 = _interopRequireDefault(_slackNode);

var _togglApi = require('toggl-api');

var _togglApi2 = _interopRequireDefault(_togglApi);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var requiredVars = ['PORT', 'FIREBASE_HOST', 'FIREBASE_TOKEN', 'TOGGL_WORKSPACE_ID', 'TOGGL_API_TOKEN', 'SLACK_API_TOKEN'];

requiredVars.filter(function (v) {
  return !process.env[v];
}).forEach(function (v) {
  console.log('Must specify ' + v);
  process.exit();
});

var cfg = {};
requiredVars.forEach(function (v) {
  return cfg[v] = process.env[v].trim();
});

var PORT = cfg.PORT;
var FIREBASE_HOST = cfg.FIREBASE_HOST;
var FIREBASE_TOKEN = cfg.FIREBASE_TOKEN;
var TOGGL_WORKSPACE_ID = cfg.TOGGL_WORKSPACE_ID;
var TOGGL_API_TOKEN = cfg.TOGGL_API_TOKEN;
var SLACK_API_TOKEN = cfg.SLACK_API_TOKEN;


var fb = new _firebase2.default(FIREBASE_HOST);

var slack = new _slackNode2.default(SLACK_API_TOKEN);

var currentEntryFor = function currentEntryFor(apiToken) {
  return new Promise(function (resolve, reject) {
    return new _togglApi2.default({ apiToken: apiToken }).getCurrentTimeEntry(function (err, result) {
      return resolve(err || result);
    });
  });
};

var getTogglCurrent = function getTogglCurrent(_ref) {
  var fullName = _ref.fullName;
  var initials = _ref.initials;
  var togglToken = _ref.togglToken;
  var slackUsername = _ref.slackUsername;

  console.log('getting toggl for', togglToken);
  if (!togglToken) {
    return new Promise(function (resolve) {
      return resolve({ fullName: fullName, initials: initials, slackUsername: slackUsername });
    });
  }
  var toggl = new _togglApi2.default({ apiToken: togglToken });
  return new Promise(function (resolve, reject) {
    return toggl.getCurrentTimeEntry(function (err, result) {
      console.log('toggl response:', err, result);
      if (err) {
        resolve({ fullName: fullName, initials: initials, slackUsername: slackUsername, err: err });
      } else {
        var response = { fullName: fullName, initials: initials, slackUsername: slackUsername };
        if (result && String(result.wid) === String(TOGGL_WORKSPACE_ID)) {
          response.start = result.start;
          response.duration = result.duration;
          response.description = result.description;
        } else if (result) {
          response.description = 'OTHER PROJECT';
        }
        resolve(response);
      }
    });
  });
};

var getSlackUsers = function getSlackUsers() {
  return new Promise(function (resolve, reject) {
    return slack.api('users.list', { presence: 1 }, function (err, response) {
      return err ? reject(err) : resolve(response);
    });
  });
};

var toRows = function toRows(obj) {
  return Object.keys(obj).map(function (k) {
    return obj[k];
  });
};

var getTeamMembers = function getTeamMembers() {
  return fb.child('teamMembers').once('value').then(function (snap) {
    return toRows(snap.val());
  });
};

var respondPresence = function respondPresence(req, res, next) {
  getSlackUsers().then(function (users) {
    console.log('users', users.members.length);
    console.log('first', users.members[0]);
    return getTeamMembers().then(function (teamMembers) {
      console.log('team members', teamMembers.length);
      return Promise.all(teamMembers.map(function (tm) {
        return getTogglCurrent(tm);
      }));
    }).then(function (membersAndTasks) {
      return membersAndTasks.map(function (mt) {
        var userPresence = users.members.find(function (u) {
          return u.name === mt.slackUsername;
        });
        return _extends({}, mt, {
          presence: userPresence && userPresence.presence
        });
      });
    });
  }).then(function (infos) {
    res.send(infos);
    next();
  }).catch(function (err) {
    return console.log(err);
  });
};

var server = _restify2.default.createServer();

server.get('/presence', respondPresence);

fb.authWithCustomToken(FIREBASE_TOKEN.trim(), function (err, auth) {
  if (err) {
    console.log('FB auth err:', err);process.exit();
  }
  server.listen(PORT, function () {
    return console.log('%s listening at %s', server.name, server.url);
  });
});