var fs = require('fs');
var jwt = require('jsonwebtoken');

module.exports = function(publicKeyPath, options) {
  var publicKey = fs.readFileSync(publicKeyPath, 'utf8');
  return function authenticate(req, res, next) {
    if (!req.session) {
      throw new Error('Session is not available. Confirm the server setting.');
    } else if (req.session.identity) {
      next();
    } else {
      var token = req.query.token;
      if (token) {
        console.log('token=', token);
          options.audience = 'enebular-spot-app';
          jwt.verify(token, publicKey, options, function(err, identity) {
            if (err) {
              return res.status(401).send(err.message);
            }
            if(process.env.USER_ID != identity.sub) {
              res.status(401).send('Unauthorized: userId does not match.');
            }else{
              console.log('Verified identity=', identity);
              req.session.identity = identity;
              res.redirect(req.path);
            }
          });
      } else {
        //req.session.identity = {};
        //res.redirect(req.path);
        res.status(401).send('Unauthorized');
      }
    }
  };
};