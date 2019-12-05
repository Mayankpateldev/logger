var app = require('../server.js');
var emailUtils = require('../utils/email-utils.js');
var Email = require('../actions/email.js');
var moment = require('moment-timezone');

const { createLogger, format, transports } = require('winston');
const { combine, timestamp, label, printf } = format;
var options = {
  file: {
    filename: `/home/ubuntu/oms.log`,
    handleExceptions: true,
    json: false,
    maxsize: 10242880, // 10MB
    maxFiles: 5,
    colorize: false,
    exitOnError: false
  },
  console: {
    handleExceptions: true,
    json: false,
    colorize: true,
    exitOnError: false
  }
};

if(app.NODE_ENV == 'development') {
  options.console.level = 'debug';
  options.file.filename = './oms.log';
}

const myFormat = printf(info => {
  return `${info.timestamp} :: ${info.level} :: ${info.file ? info.file : ""} :: ${ info.message} :::: ${ (info.info || info.warn || info.error || info.debug) ? (JSON.stringify(info.info) || JSON.stringify(info.warn) || JSON.stringify(info.error) || JSON.stringify(info.debug)) : "" } `;
});

const logger = createLogger({
  format: combine(
    timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    myFormat
  ),
  transports: [new transports.Console(options.console),new transports.File(options.file)]
});

module.exports = {
  logVerbose: function (message) {
    logger.log('info', message, {file: __parent_line_logger});
  },
  logError: function (message) {
    logger.log('error', message, {file: __parent_line_logger});
  },
  logErrorAndEmail: function(err, subject) {
    console.error(err);
    // Email.sendEmail({
    if(app.NODE_ENV == 'production'){
      app.queueHandler.sendEmail({
        toAddresses: emailUtils.getErrorAddresses(),
        html: `<h3><pre>${JSON.stringify(err, Object.getOwnPropertyNames(err), 4)}</pre></h3>`,
        subject: `${subject || 'New Error From OMS'} on ${moment.tz(new Date(), "Asia/Kolkata").format('YYYY-MM-DD HH:mm:ss')}`,
        from: emailUtils.getFromAddress(),
        replyToAddresses: [emailUtils.getReplyToAddress()]
      });
    }
  },
  debug: function (msg, obj) {
    obj ? (obj.file = obj.file ? __parent_line_logger : __parent_line_console) : (obj = {file: __parent_line_console});
    logger.log('debug', msg,obj);
  },
  info: function (msg, obj) {
    obj ? (obj.file = obj.file ? __parent_line_logger : __parent_line_console) : (obj = {file: __parent_line_console});
    logger.log('info', msg,obj);
  },
  warn: function(msg, obj) {
    obj ? (obj.file = obj.file ? __parent_line_logger : __parent_line_console) : (obj = {file: __parent_line_console});
    logger.log('warn', msg, obj);
  },
  error: function (msg, obj) {
    obj ? (obj.file = obj.file ? __parent_line_logger : __parent_line_console) : (obj = {file: __parent_line_console});
    logger.log('error', msg,obj);
  }
};


function get_parent_line(level){
  var all = [];
  var orig = Error.prepareStackTrace;
  Error.prepareStackTrace = function(_, stack) {
    return stack;
  };
  var err = new Error;
  // Error.captureStackTrace(err, arguments.callee);
  var stack = err.stack;
  Error.prepareStackTrace = orig;
  if(stack[level]){
    if(stack[level].getFileName())
      all.push(stack[level].getFileName());
    // if( stack[level].getFunctionName())
    //   all.push(stack[level].getFunctionName());
    if(stack[level].getLineNumber())
      all.push(stack[level].getLineNumber());
  }
  var line  = all.join(':');
  // process.stdout.write(line);
  var reg_build_folder = new RegExp("[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{2}-[0-9]{2}-[0-9]{2}") ;
  // console.console_log( line);
  if (line.indexOf('node_modules') > -1 || line.indexOf('events.js:g') > -1) {
    return "";
  } else {
    var split_by = "";
    split_by = (reg_build_folder.test(line)) ? line.match(reg_build_folder)[0] : 'oms';
    var split_hosting_dir = line.split('/' + split_by + '/');
    if (split_hosting_dir.length > 1) {
      return split_hosting_dir[split_hosting_dir.length - 1];
    } else {
      return line;
    }
  }
}

//only rename the 'get' function to something else to remove line number logging implementation
Object.defineProperty(global, '__parent_line_console', {
  get: function() {
    return get_parent_line(4)
  }
});
Object.defineProperty(global, '__parent_line_logger', {
  get: function() {
    return get_parent_line(3)
  }
});


// To Test logfilename and line number implementation
// console.error("console error");
// console.log("console log");
// console.info("console info");
// console.debug("console debug");
// console.warn("console warn");
//
// Logger.error("error", {});
// Logger.info("info", {file: __filename});
// Logger.debug("debug", {file: __filename});
// Logger.warn("warn", {file: __filename});

