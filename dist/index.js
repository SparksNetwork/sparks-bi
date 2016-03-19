'use strict';

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

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
      return resolve(err || _extends({ togglToken: apiToken }, result));
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

var inWorkspace = function inWorkspace(togglUser) {
  return togglUser && String(togglUser.wid) === String(TOGGL_WORKSPACE_ID);
};

var buildPresenceRow = function buildPresenceRow(_ref2, sUsers, tUsers) {
  var fullName = _ref2.fullName;
  var slackUsername = _ref2.slackUsername;
  var togglToken = _ref2.togglToken;

  var sUser = sUsers.find(function (u) {
    return u.name === slackUsername;
  });

  var tUser = tUsers.find(function (u) {
    return u.togglToken === togglToken;
  });

  return {
    fullName: fullName,
    presence: sUser && sUser.presence || 'N/A',
    duration: inWorkspace(tUser) && tUser.duration || 0,
    description: inWorkspace(tUser) && tUser.description
  };
};

var getSlackUsers = function getSlackUsers() {
  return new Promise(function (resolve, reject) {
    return slack.api('users.list', { presence: 1 }, function (err, response) {
      return err ? reject(err) : resolve(response.members);
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
  Promise.all([getTeamMembers(), getSlackUsers()]).then(function (_ref3) {
    var _ref4 = _slicedToArray(_ref3, 2);

    var members = _ref4[0];
    var sUsers = _ref4[1];
    return Promise.all(members.map(function (_ref5) {
      var togglToken = _ref5.togglToken;
      return togglToken && currentEntryFor(togglToken) || { togglToken: togglToken };
    })).then(function (tUsers) {
      return [members, sUsers, tUsers];
    });
  }).then(function (_ref6) {
    var _ref7 = _slicedToArray(_ref6, 3);

    var members = _ref7[0];
    var sUsers = _ref7[1];
    var tUsers = _ref7[2];
    return members.map(function (m) {
      return buildPresenceRow(m, sUsers, tUsers);
    });
  }).then(function (rows) {
    res.send(rows);
    next();
  }).catch(function (err) {
    return console.log(err);
  });

  // getSlackUsers()
  // .then(users => {
  //   return getTeamMembers().then(teamMembers => {
  //     console.log('team members', teamMembers.length)
  //     return Promise.all(teamMembers.map(tm => getTogglCurrent(tm)))
  //   })
  //   .then(membersAndTasks =>
  //     membersAndTasks.map(mt => {
  //       const userPresence = users.members.find(u => u.name === mt.slackUsername)
  //       return {
  //         ...mt,
  //         presence: userPresence && userPresence.presence,
  //       }
  //     })
  //   )
  // })
  // .then(infos => {
  //   res.send(infos)
  //   next()
  // })
  // .catch(err => console.log(err))
};

// const respondPresence = (req, res, next) => {
//   getSlackUsers()
//   .then(users => {
//     return getTeamMembers().then(teamMembers => {
//       console.log('team members', teamMembers.length)
//       return Promise.all(teamMembers.map(tm => getTogglCurrent(tm)))
//     })
//     .then(membersAndTasks =>
//       membersAndTasks.map(mt => {
//         const userPresence = users.members.find(u => u.name === mt.slackUsername)
//         return {
//           ...mt,
//           presence: userPresence && userPresence.presence,
//         }
//       })
//     )
//   })
//   .then(infos => {
//     res.send(infos)
//     next()
//   })
//   .catch(err => console.log(err))
// }

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