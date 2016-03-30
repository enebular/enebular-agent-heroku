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

var settings;


function timeoutWrap(func) {
    return when.promise(function(resolve,reject,notify) {
        var promise = func().timeout(5000,"timeout");
        promise.then(function(a,b,c,d) {
            //heartBeatLastSent = (new Date()).getTime();
            resolve(a,b,c,d);
        });
        promise.otherwise(function(err) {
            console.log("TIMEOUT: ",func);
            if (err == "timeout") {
                resolve(func());
            } else {
                reject(err);
            }
        });
    });
}

function getEnebularFlow(cb) {
    var defer = when.defer();
    if(settings.enebularUrl && settings.flowId) {
        var url = settings.enebularUrl + "/flows/"+settings.flowId+"?access_token=" + settings.accessToken;
        request.get(
            {url: url, json:false},
            function (err, res, body) {
                if (!err && res.statusCode == 200) {
                    var data = JSON.parse(body);
                    defer.resolve( JSON.parse(cb(data)) );
                } else {
                    defer.reject(err);
                }   
            }   
        );
    }else{
        defer.resolve( [] );
    }
    return defer.promise;
}

function saveEnebularFlow(params) {
    var defer = when.defer();
    var url = settings.enebularUrl + "/flows/"+settings.flowId+"?access_token=" + settings.accessToken;
    request({ url: url, method: 'PUT', json: params, function(err, res, body) {
            if (!err && res.statusCode == 200) {
                console.log("save flows to enebular");
                defer.resolve();
            } else {
                defer.reject(err);
            }   
        }
    });
    return defer.promise;
}

function getFlows() {
    return getEnebularFlow(function(data) {
        return (data.body);
    });
}

function saveFlows(flows) {
    var params = {
      "body": JSON.stringify(flows)
    };
    return saveEnebularFlow(params);
}

function getCredentials() {
    return getEnebularFlow(function(data) {
        return (data.cred);
    });
}

function saveCredentials(credentials) {
    var params = {
      "cred": JSON.stringify(credentials)
    };
    return saveEnebularFlow(params);
}

function getSettings () {
    var defer = when.defer();
    defer.resolve({});
    return defer.promise;
}

function saveSettings (settings) {
    var defer = when.defer();
    defer.resolve();
    return defer.promise;
}

function getAllFlows() {
    var defer = when.defer();
    var url = settings.enebularUrl + "/projects/"+settings.projectId+"/flows?access_token=" + settings.accessToken;
    request.get(
        {url: url, json:false},
        function (err, res, body) {
            if (!err && res.statusCode == 200) {
                var flows = JSON.parse(body);
                defer.resolve({f:flows.map(function(f) {
                    return f.id;
                })});
            } else {
                defer.reject(err);
            }   
        }   
    );
    return defer.promise;
}

function getFlow(fn) {
    var defer = when.defer();
    var url = settings.enebularUrl + "/flows/"+fn+"?access_token=" + settings.accessToken;
    request.get(
        {url: url, json:false},
        function (err, res, body) {
            if (!err && res.statusCode == 200) {
                var enebularFlow = JSON.parse(body);
                defer.resolve(JSON.parse(enebularFlow.body));
            } else {
                defer.reject(err);
            }   
        }   
    );
    return defer.promise;
}

function saveFlow(fn,data) {
    var defer = when.defer();
    var url = settings.enebularUrl + "/flows/"+fn+"?access_token=" + settings.accessToken;
    var params = {
      "title": fn,
      "description": "",
      "body": data,
      "tags": [],
      "userId": settings.userId
    };
    request({ url: url, method: 'PUT', json: params, function(err, res, body) {
            if (!err && res.statusCode == 200) {
                console.log("save flows to enebular");
                defer.resolve();
            } else {
                defer.reject(err);
            }   
        }
    });
    return defer.promise;
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
        return saveFlows(flows);
    },

    getCredentials: function() {
        return getCredentials();
    },

    saveCredentials: function(credentials) {
        return saveCredentials(credentials);
    },

    getSettings: function() {
        return timeoutWrap(function() { return getSettings();});
    },

    saveSettings: function(data) {
        return timeoutWrap(function() { return saveSettings(data);});
    },

    getAllFlows: function() {
        return getAllFlows();
    },

    getFlow: function(fn) {
        return getFlow(fn);
    },

    saveFlow: function(fn,data) {
        return timeoutWrap(function() { return saveFlow(fn,data);});
    },

    getLibraryEntry: function(type,path) {
        return timeoutWrap(function() { return getLibraryEntry(type,path);});
    },
    saveLibraryEntry: function(type,path,meta,body) {
        return timeoutWrap(function() { return saveLibraryEntry(type,path,meta,body);});
    }
};

module.exports = enebularstorage;