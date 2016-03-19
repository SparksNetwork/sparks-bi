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

// const getTogglCurrent = ({fullName, initials, togglToken, slackUsername}) => {
//   console.log('getting toggl for', togglToken)
//   if (!togglToken) {
//     return new Promise(resolve => resolve({fullName, initials, slackUsername}))
//   }
//   const toggl = new Toggl({apiToken: togglToken})
//   return new Promise((resolve,reject) =>
//     toggl.getCurrentTimeEntry((err,result) => {
//       console.log('toggl response:', err, result)
//       if (err) {
//         resolve({fullName, initials, slackUsername, err})
//       } else {
//         const response = {fullName, initials, slackUsername}
//         if (result && String(result.wid) === String(TOGGL_WORKSPACE_ID)) {
//           response.start = result.start
//           response.duration = result.duration
//           response.description = result.description
//         } else if (result) {
//           response.description = 'OTHER PROJECT'
//         }
//         resolve(response)
//       }
//     })
//   )
// }

var inWorkspace = function inWorkspace(togglUser) {
  return togglUser && String(togglUser.wid) === String(TOGGL_WORKSPACE_ID);
};

var buildPresenceRow = function buildPresenceRow(_ref, sUsers, tUsers) {
  var fullName = _ref.fullName;
  var slackUsername = _ref.slackUsername;
  var togglToken = _ref.togglToken;

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

var buildTimeRow = function buildTimeRow(_ref2, totals) {
  var initials = _ref2.initials;
  var togglUid = _ref2.togglUid;

  var details = totals.find(function (_ref3) {
    var uid = _ref3.uid;
    return uid === togglUid;
  });
  console.log('details', details);
  return {
    initials: initials,
    totals: details && details.totals.slice(0, -1)
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
  Promise.all([getTeamMembers(), getSlackUsers()]).then(function (_ref4) {
    var _ref5 = _slicedToArray(_ref4, 2);

    var members = _ref5[0];
    var sUsers = _ref5[1];
    return Promise.all(members.map(function (_ref6) {
      var togglToken = _ref6.togglToken;
      return togglToken && currentEntryFor(togglToken) || { togglToken: togglToken };
    })).then(function (tUsers) {
      return [members, sUsers, tUsers];
    });
  }).then(function (_ref7) {
    var _ref8 = _slicedToArray(_ref7, 3);

    var members = _ref8[0];
    var sUsers = _ref8[1];
    var tUsers = _ref8[2];
    return members.map(function (m) {
      return buildPresenceRow(m, sUsers, tUsers);
    });
  }).then(function (rows) {
    res.send(rows);
    next();
  }).catch(function (err) {
    return console.log(err);
  });
};

var getWeeklyTotals = function getWeeklyTotals() {
  return new Promise(function (resolve, reject) {
    return new _togglApi2.default({ apiToken: TOGGL_API_TOKEN }).weeklyReport({
      workspace_id: TOGGL_WORKSPACE_ID,
      grouping: 'users'
    }, function (err, result) {
      return resolve(err || result.data);
    });
  });
};

var respondTimeRolling = function respondTimeRolling(req, res, next) {
  Promise.all([getTeamMembers(), getWeeklyTotals()]).then(function (_ref9) {
    var _ref10 = _slicedToArray(_ref9, 2);

    var members = _ref10[0];
    var totals = _ref10[1];
    return members.map(function (m) {
      return buildTimeRow(m, totals);
    });
  }).then(function (rows) {
    res.send({ members: rows });
    next();
  }).catch(function (err) {
    return console.log(err);
  });
};

var server = _restify2.default.createServer();

server.get('/presence', respondPresence);

server.get('/time/pastSeven', respondTimeRolling);

fb.authWithCustomToken(FIREBASE_TOKEN.trim(), function (err, auth) {
  if (err) {
    console.log('FB auth err:', err);process.exit();
  }
  server.listen(PORT, function () {
    return console.log('%s listening at %s', server.name, server.url);
  });
});