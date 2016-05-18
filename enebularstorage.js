/**
 * Copyright 2014 IBM Corp.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/

var request = require('request');
var settings = require('./settings');
var when = require('when');
var util = require('util');
var uuid = require('uuid');
var RED = require('node-red/red/red');

var settings;


function timeoutWrap(func) {
    return when.promise(function(resolve,reject,notify) {
        var promise = func().timeout(5000,"timeout");
        promise.then(function(a,b,c,d) {
            //heartBeatLastSent = (new Date()).getTime();
            resolve(a,b,c,d);
        });
        promise.otherwise(function(err) {
            console.log("TIMEOUT: ",func, err);
            if (err == "timeout") {
                resolve(func());
            } else {
                reject(err);
            }
        });
    });
}

function getPackages(flows) {
    var nodeList = RED.nodes.getNodeList();
    var types = nodeList.reduce(function(types, node) {
      (node.types || []).forEach(function(type) {
        types[type] = [ node.module, node.version ];
      });
      return types;
    }, {});
    return flows.reduce(function(packages, node) {
      var modVer = types[node.type];
      if (modVer) {
        var module = modVer[0], version = modVer[1];
        if (module !== 'node-red' && module !== 'node-red-node-aws-lambda-io') {
          packages[module] = version;
        }
      }
      return packages;
    }, {});
}

function getEnebularFlow(key, defaultValue, cb) {
    return when.promise(function(resolve,reject,notify) {
        if(settings.enebularUrl && settings.flowId!='new') {
            var url = settings.enebularUrl + "/FlowWorkspaces/"+settings.flowId+"?access_token=" + settings.accessToken;
            request.get(
                {url: url, json:false},
                function (err, res, body) {
                    if(err) {
                        reject(err);
                        return;
                    }
                    if(res.statusCode != 200) {
                        resolve( defaultValue );
                        return;
                    }
                    var data = JSON.parse(body);
                    if(data[key]) {
                        if(cb) cb(data);
                        resolve( JSON.parse(data[key]) );
                    }else{
                        resolve( defaultValue );
                    }
                }   
            );
        }else{
            resolve( defaultValue );
        }
    });
}

var currentFlowId = null;

function saveEnebularFlow(params) {
    var flowId = settings.flowId;
    var url = settings.enebularUrl + "/FlowWorkspaces/"+flowId+"?access_token=" + settings.accessToken;
    return when.promise(function(resolve,reject,notify) {
        request({ url: url, method: 'PUT', json: params}, function(err, res, body) {
                if(err) {
                    reject(err);
                    return;
                }
                //404なら新規作成
                if(res.statusCode == 404 && body.error.code == "MODEL_NOT_FOUND") {
                    var url = settings.enebularUrl + "/projects/"+settings.projectId + "/flows?access_token=" + settings.accessToken;
                    params.id = flowId;
                    request.post({ url: url, json: true, form: params}, function(err, res, body) {
                            if (!err && res.statusCode == 200) {
                                console.log("create flows to enebular", flowId);
                                resolve();
                            } else {
                                reject(err);
                            }
                        });
                    return;
                }
                console.log("save flows to enebular", flowId);
                resolve();
            });
    });
}

function getFlows() {
    return getEnebularFlow('body', [], function(data) {
        for(var key in data.packages) {
            RED.nodes.installModule(key).otherwise(function(err) {
                
            });
        }
    });
}

function saveFlows(flows) {
    var params = {
      "body": JSON.stringify(flows),
      "packages": getPackages(flows)
    };
    return saveEnebularFlow(params);
}

function getCredentials() {
    return getEnebularFlow('cred', {});
}

function saveCredentials(credentials) {
    var params = {
      "cred": JSON.stringify(credentials)
    };
    return saveEnebularFlow(params);
}

function getSettings () {
    return when.promise(function(resolve,reject,notify) {
        resolve({});
    });
}

function saveSettings (settings) {
    return when.promise(function(resolve,reject,notify) {
        resolve();
    });
}

function getAllFlows() {
    return when.promise(function(resolve,reject,notify) {
        var url = settings.enebularUrl + "/projects/"+settings.projectId+"/flows?access_token=" + settings.accessToken;
        request.get(
            {url: url, json:false},
            function (err, res, body) {
                if (!err && res.statusCode == 200) {
                    var flows = JSON.parse(body);
                    resolve({f:flows.map(function(f) {
                        return f.id;
                    })});
                } else {
                    reject(err);
                }   
            }   
        );
    });
}

function getFlow(fn) {
    return when.promise(function(resolve,reject,notify) {
        var url = settings.enebularUrl + "/FlowWorkspaces/"+fn+"?access_token=" + settings.accessToken;
        request.get(
            {url: url, json:false},
            function (err, res, body) {
                if (!err && res.statusCode == 200) {
                    var enebularFlow = JSON.parse(body);
                    resolve(JSON.parse(enebularFlow.body));
                } else {
                    reject(err);
                }   
            }   
        );
    });
}

function saveFlow(fn,data) {
    return when.promise(function(resolve,reject,notify) {
        var url = settings.enebularUrl + "/FlowWorkspaces/"+fn+"?access_token=" + settings.accessToken;
        var params = {
          "title": fn,
          "description": "",
          "body": data,
          "tags": [],
          "userId": settings.userId
        };
        request({ url: url, method: 'PUT', json: params}, function(err, res, body) {
                if (!err && res.statusCode == 200) {
                    console.log("save flows to enebular");
                    resolve();
                } else {
                    reject(err);
                }
            });
    });
}

function getLibraryEntry(type,path) {
    console.log(type,path);
    var defer = when.defer();
    defer.resolve([]);
    return defer.promise;
}

function saveLibraryEntry(type,path,meta,body) {
    var defer = when.defer();
    console.log(type,path,meta,body);
    defer.resolve();
    return defer.promise;
}

var enebularstorage = {
    init: function(_settings) {
        settings = _settings;
    },
    getFlows: function() {
        return getFlows();
    },
    saveFlows: function(flows) {
        return timeoutWrap(function() {return saveFlows(flows);});
    },

    getCredentials: function() {
        return getCredentials();
    },

    saveCredentials: function(credentials) {
        return saveCredentials(credentials);
    },

    getSettings: function() {
        return getSettings();
    },

    saveSettings: function(data) {
        return saveSettings(data);
    },

    getAllFlows: function() {
        return getAllFlows();
    },

    getFlow: function(fn) {
        return getFlow(fn);
    },

    saveFlow: function(fn,data) {
        return saveFlow(fn,data);
    },

    getLibraryEntry: function(type,path) {
        return timeoutWrap(function() { return getLibraryEntry(type,path);});
    },
    saveLibraryEntry: function(type,path,meta,body) {
        return timeoutWrap(function() { return saveLibraryEntry(type,path,meta,body);});
    }
};

module.exports = enebularstorage;