/**
 * fis.baidu.com
 */
var _ = fis.util;
var path = require('path');
var fs = require('fs');
var prompt = require('prompt');
prompt.start();

function upload(receiver, to, data, release, content, file, callback) {
  var subpath = file.subpath;
  data['to'] = _(path.join(to, release));
  fis.util.upload(
      //url, request options, post data, file
      receiver, null, data, content, subpath,
      function(err, res) {
        var json = null;
        res = res && res.trim();

        try {
          json = res ? JSON.parse(res) : null;
        } catch (e) {}

        if (!err && json && json.errno) {
          callback(json);
        } else if (err || !json && res != '0') {
          callback('upload file [' + subpath + '] to [' + to + '] by receiver [' + receiver + '] error [' + (err || res) + ']');
        } else {
          var time = '[' + fis.log.now(true) + ']';
          process.stdout.write(
              '\n - '.green.bold +
              time.grey + ' ' +
              subpath.replace(/^\//, '') +
              ' >> '.yellow.bold +
              to + release
          );
          callback();
        }
      }
  );
}

function fetch(url, data, callback) {
  var endl = '\r\n';
  var collect = [];
  var opt = {};

  _.map(data, function(key, value) {
    collect.push(key + '=' + encodeURIComponent(value))
  });

  var content = collect.join('&');
  opt.method = opt.method || 'POST';
  opt.headers = _.assign({
    'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8'
  }, opt.headers || {});
  opt = fis.util.parseUrl(url, opt);
  var http = opt.protocol === 'https:' ? require('https') : require('http');
  var req = http.request(opt, function(res) {
    var status = res.statusCode;
    var body = '';
    res
      .on('data', function(chunk) {
        body += chunk;
      })
      .on('end', function() {
        if (status >= 200 && status < 300 || status === 304) {
          var json = null;
          try {json = JSON.parse(body);} catch(e) {};

          if (!json || json.errno) {
            callback(json || 'The response is not valid json string.')
          } else {
            callback(null, json);
          }
        } else {
          callback(status);
        }
      })
      .on('error', function(err) {
        callback(err.message || err);
      });
  });
  req.write(content);
  req.end();
}

function requireEmail(authApi, validateApi, info, cb) {
  prompt.get({
    properties: {
      email: {
        pattern: /^((([a-z]|\d|[!#\$%&'\*\+\-\/=\?\^_`{\|}~]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])+(\.([a-z]|\d|[!#\$%&'\*\+\-\/=\?\^_`{\|}~]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])+)*)|((\x22)((((\x20|\x09)*(\x0d\x0a))?(\x20|\x09)+)?(([\x01-\x08\x0b\x0c\x0e-\x1f\x7f]|\x21|[\x23-\x5b]|[\x5d-\x7e]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(\\([\x01-\x09\x0b\x0c\x0d-\x7f]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF]))))*(((\x20|\x09)*(\x0d\x0a))?(\x20|\x09)+)?(\x22)))@((([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])*([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])))\.)+(([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])*([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])))$/i,
        message: 'The specified value must be a valid email address.',
        description: 'Enter your email',
        required: true,
        default: info.email
      }
    }
  }, function(error, ret) {
    if (error) {
      return cb(error);
    }

    info.email = ret.email;
    deployInfo(authApi, info);

    fetch(authApi, {
      email: ret.email
    }, function(error, ret) {
      if (error) {
        return cb(error);
      }

      console.log('We\'re already sent the code to your email.')

      requireToken(validateApi, info, cb);
    });
  })
}

function requireToken(validateApi, info, cb) {
  prompt.get({
    properties: {
      code: {
        description: 'Enter your code',
        required: true,
        hide: true
      }
    }
  }, function(error, ret) {
    if (error) {
      return cb(error);
    }

    info.code = ret.code;
    deployInfo(validateApi, info);

    fetch(validateApi, {
      email: info.email,
      code: info.code
    }, function(error, ret) {
      if (error) {
        return cb(error);
      }

      info.token = ret.data.token;
      deployInfo(validateApi, info);
      cb(null, info);
    });
  })
}

function getTmpFile(host) {
  return fis.project.getTempPath(`deploy-${host}.json`);
}

// 设置时间阈值（3个月前）
const timeThreshold = new Date();
timeThreshold.setMonth(timeThreshold.getMonth() - 3);

function deleteOldDeployFilesSync(directoryPath) {
    try {
        // 读取目录内容（同步）
        const files = fs.readdirSync(directoryPath);

        // 过滤出以 'deploy-' 开头的 JSON 文件
        const deployFiles = files.filter(file => file.startsWith('deploy-') && file.endsWith('.json'));

        for (const file of deployFiles) {
            const filePath = path.join(directoryPath, file);
            const fileStat = fs.statSync(filePath);
            console.log(`Deleting file: ${filePath}`);
            // 检查文件的最后修改时间
            if (fileStat.mtime < timeThreshold) {
                console.log(`Deleting file: ${filePath}`);
                fs.unlinkSync(filePath);
            }
        }

        console.log('Operation completed.');
    } catch (err) {
        console.error(`Error occurred: ${err.message}`);
    }
}
console.log('Deleting old deploy files...', fis.project.getTempPath());
deleteOldDeployFilesSync(fis.project.getTempPath());

function read(conf) {
  var ret = null;

  try {
    // getter
    ret = fis.util.isFile(conf) ? require(conf) : null;
  } catch (e) {

  }
  return ret;
}

function deployInfo(receiver, options) {
  const urlInfo = new URL(receiver);
  var conf = getTmpFile(urlInfo.host);

  if (arguments.length > 1) {
    // setter
    return options && fis.util.write(conf, JSON.stringify(options, null, 2));
  } else {
    return read(conf);
  }
};

module.exports = function(options, modified, total, callback) {
  if (!options.to) {
    throw new Error('options.to is required!');
  }

  var to = options.to;
  var receiver = options.receiver;
  var authApi = options.authApi;
  var validateApi = options.validateApi;
  var data = options.data || {};

  if (options.host) {
    receiver = options.receiver = options.host + '/v1/upload';
    authApi = options.authApi = options.host + '/v1/authorize';
    validateApi = options.validateApi = options.host + '/v1/validate';
  }

  var info = deployInfo(receiver) || {};

  if (!options.receiver) {
    throw new Error('options.receiver is required!');
  }

  var steps = [];

  modified.forEach(function(file) {
    var reTryCount = options.retry;
    steps.push(function(next) {
      var _upload = arguments.callee;

      data.email = info.email;
      data.token = info.token;

      upload(receiver, to, data, file.getHashRelease(), file.getContent(), file, function(error) {
        if (error) {
          if (error.errno === 100302 || error.errno === 100305) {
            // 检测到后端限制了上传，要求用户输入信息再继续。

            if (!authApi || !validateApi) {
              throw new Error('options.authApi and options.validateApi is required!');
            }

            if (info.email) {
              console.error('\nToken is invalid: ', error.errmsg, '\n');
            }

            requireEmail(authApi, validateApi, info, function(error) {
              if (error) {
                throw new Error('Auth failed! ' + error.errmsg);
              } else {
                _upload(next);
              }
            });
          } else if (options.retry && !--reTryCount) {
            throw new Error(error.errmsg || error);
          } else {
            _upload(next);
          }
        } else {
          next();
        }
      });
    });
  });

  _.reduceRight(steps, function(next, current) {
    return function() {
      current(next);
    };
  }, callback)();
};

module.exports.options = {
  // 允许重试两次。
  retry: 2
};
