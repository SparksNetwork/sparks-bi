'use strict';

var _restler = require('restler');

var _restler2 = _interopRequireDefault(_restler);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

_restler2.default.get('http://localhost:8000/presence').on('complete', function (result) {
  return console.log(result);
});

// rest.get('http://localhost:8000/time/rolling')
// .on('complete', result => console.log(result))