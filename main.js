var child_process = require("child_process");

restart();

function restart(_envs) {
	var envs = _envs || {};
	envs.ISSUER = process.env.ISSUER;
	var app = child_process.fork("./app", [], {env:envs});
	app.on("message", function (msg) {
	    if(msg.event == 'restart') {
	    	app.kill();
	    	setTimeout(function() {
		    	restart(msg.envs);
	    	}, 1000);
	    }
	});
}
