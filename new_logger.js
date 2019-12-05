var winston = require('winston');
var moment = require('moment');
var fs = require('fs');
var uuid = require('uuid/v4');
var _ = require('underscore');
const {createLogger} = require('winston');
const logform = require('logform');
const {combine, timestamp, label, printf} = logform.format;
var DailyRotateFile = require('winston-daily-rotate-file');

const ENV = process.env;

const LOG_DIR = ENV.LOG_DIR ? ENV.LOG_DIR : '/home/ubuntu/logs';
const JSON_DUMP_DIR = ENV.JSON_DUMP_DIR ? ENV.JSON_DUMP_DIR : '/home/ubuntu/json_dumps';
const LOG_FILE_NAME = 'loggerapi.%DATE%';
const ENABLE_FILE_LOGS = true;
const USE_JSON_FILE_LOGGING = false;
const ENABLE_CONSOLE_LOGS = true;
const LOG_LEVEL = ENV.LOG_LEVEL ? ENV.LOG_LEVEL : 'debug';
const CONSOLE_LOG_LEVEL = ENV.CONSOLE_LOG_LEVEL ? ENV.CONSOLE_LOG_LEVEL : 'debug';
const MAX_LOG_FILE_SIZE = '500m'; // 500 MB,
const MAX_LOG_FILES = '15d'; // 15 days,
const LOG_ERR_STACK = true;

if (!fs.existsSync(JSON_DUMP_DIR)) {
  fs.mkdirSync(JSON_DUMP_DIR);
}

if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR);
}

// ************  NOTE *************
// DO NOT EDIT BELOW IMPLEMENTATION
// LOGGER FUNCTIONS ACCEPTS STRICTLY ONLY 2 ARGUMENTS, 1ST IS THE LOG STRING AND SECOND IS JSON OBJECT

let isError = function (e) {
  return (e && e.stack && e.message) ? true : false;
}

// helps to handle the Error object and other json passed in second argument to logger functions.
function parseOtherObjects(info) {
  var new_info = {};
  for (let key in info) {
    if (!['timestamp', 'level', 'message', 'filename'].includes(key)) {
      if (isError(info[key])) {
        new_info.err = info[key].message;
        if (LOG_ERR_STACK)
          new_info.stack = info[key].stack;
      } else
        new_info[key] = info[key];
    }
  }
  return new_info;
}

let console_format = combine(printf(info => {
  var other_info = parseOtherObjects(info);
  return `${info.timestamp} :: [${process.pid}] :: ${info.level} :: ${info.filename} :: ${info.message} :: ${JSON.stringify(other_info)}`;
}));

// to be used with DailyRotateFile transport, when json logging is required.
var file_format = combine(printf(info => {
  var other_info = parseOtherObjects(info);
  info.pid = process.pid;
  return JSON.stringify(_.extend(info, other_info));
}));
var json_transport_console = {
  level: CONSOLE_LOG_LEVEL,
  stderrLevels: ['error'],
  format: console_format
};

var json_transport_file = {
  filename: LOG_DIR + '/' + LOG_FILE_NAME,
  level: LOG_LEVEL,
  datePattern: 'YYYY-MM-DD',
  maxSize: MAX_LOG_FILE_SIZE,
  maxFiles: MAX_LOG_FILES,
  format: USE_JSON_FILE_LOGGING? file_format: console_format
};

const logger = createLogger({
  format: combine(timestamp({format: 'YYYY-MM-DD HH:mm:ss'}))
});

if (ENABLE_CONSOLE_LOGS) {
  logger.add(new (winston.transports.Console)(json_transport_console));
}
if (ENABLE_FILE_LOGS) {
  logger.add(new (DailyRotateFile)(json_transport_file));
}

// this helps to retrieve the filename and line number where the logger function will be called.
function get_parent_line(level) {
  var all = [];
  var orig = Error.prepareStackTrace;
  Error.prepareStackTrace = function (_, stack) {
    return stack;
  };
  var err = new Error;
  // Error.captureStackTrace(err, arguments.callee);
  var stack = err.stack;
  Error.prepareStackTrace = orig;

  if (stack[level]) {
    if (stack[level].getFileName())
      all.push(stack[level].getFileName());
    if (stack[level].getLineNumber())
      all.push(stack[level].getLineNumber());
  }
  var line = all.join(':');
  // process.stdout.write(line);
  var reg_build_folder = new RegExp("[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{2}-[0-9]{2}-[0-9]{2}");
  if (line.indexOf('node_modules') > -1 || line.indexOf('events.js:g') > -1) {
    return "";
  } else {
    var split_by = "";
    split_by = (reg_build_folder.test(line)) ? line.match(reg_build_folder)[0] : 'logger';
    var split_hosting_dir = line.split('/' + split_by + '/');
    if (split_hosting_dir.length > 1) {
      return split_hosting_dir[split_hosting_dir.length - 1];
    } else {
      return line;
    }
  }
}

var generic_log = function (level, msg, obj) {
  if (obj && typeof obj === 'object') {
    obj.filename = get_parent_line(3);
    if (obj.json_dump) {
      obj.json_dump_ref = dump_json_data(obj.json_dump);
      delete obj.json_dump;
    }
  } else {
    obj = {0: obj, filename: get_parent_line(3)}
  }
  logger[level](msg, obj)
}


var export_logger = {
  debug: (msg, obj) => generic_log('debug', msg, obj),
  info: (msg, obj) => generic_log('info', msg, obj),
  warn: (msg, obj) => generic_log('warn', msg, obj),
  log: (msg, obj) => generic_log('debug', msg, obj),
  error: (msg, obj) => generic_log('error', msg, obj),
};

//todo: setup an alternate method(outside this application) to sync of json dumps to s3, which will be a public bucket without listobject options. a direct link will be available in the log line
function dump_json_data(json_data) {
  try {
    var json_dump_file = uuid() + '.json';
    var abs_json_dump_path = JSON_DUMP_DIR + '/' + moment().format('YYYYMMDD');
    if (json_data) {
      if (!fs.existsSync(abs_json_dump_path)) {
        fs.mkdirSync(abs_json_dump_path)
      }
      fs.writeFileSync(abs_json_dump_path + '/' + json_dump_file, json_data);
    }
    return abs_json_dump_path + '/' + json_dump_file;
  } catch (e) {
    //todo: deliberately ignored logging, must be handled later.
    //console.log(e)
    return "NA";
  }
}

// transport  = file|console|null    -- if null then both transport gets updated
export_logger.setLogLevel = function (level, transport) {
  var new_json_transport_file = _.clone(json_transport_file);
  var new_json_transport_console = _.clone(json_transport_console);
  new_json_transport_console.level = level;
  new_json_transport_file.level = level;

  logger.clear();
  switch (transport) {
    case 'file':
      logger.add(new (DailyRotateFile)(new_json_transport_file));
      logger.add(new (winston.transports.Console)(json_transport_console));
      break;
    case 'console':
      logger.add(new (winston.transports.Console)(new_json_transport_console));
      logger.add(new (DailyRotateFile)(json_transport_file));
      break;
    default:
      logger.add(new (DailyRotateFile)(new_json_transport_file));
      logger.add(new (winston.transports.Console)(new_json_transport_console));
  }
};

process.on('message', function (packet) {
  console.log('====>>', packet);
  switch (packet.type) {
    case "update:loglevel":
      export_logger.setLogLevel(packet.data.level);
      break;
  }
});
//// to update the loglevel in run time use the code below


module.exports = export_logger;
