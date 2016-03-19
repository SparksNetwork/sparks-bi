"use strict";

var _interopRequire = function (obj) { return obj && obj.__esModule ? obj["default"] : obj; };

var rest = _interopRequire(require("restler"));

rest.get("http://localhost:8000/presence").on("complete", function (result) {
  return console.log(result);
});