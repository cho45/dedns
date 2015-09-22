//#!node

var dns = require('native-dns');
var fs = require('fs');
var log = require('bunyan').createLogger({ name : 'dedns', level: process.env.LOG_LEVEL });

function parseHosts(hosts) {
	var map = {};
	var lines = hosts.split(/\n/);
	for (var i = 0, len = lines.length; i < len; i++) {
		var line = lines[i].replace(/\s*#.*$/, '').replace(/^\s+|\s+$/g, '');
		if (!line) continue;
		var splitted = line.split(/\s+/);
		map[splitted[1]] = splitted[0];
	}
	return map;
}

var answers = parseHosts(fs.readFileSync('/etc/hosts', 'utf-8'));
var server = dns.createServer();

server.on('request', function (req, res) {
	log.debug('new query', req.question);

	function proxy () {
		var r = dns.Request({
			question: req.question[0],
			server: {
				address: '8.8.8.8',
				port: 53,
				type: 'udp'
			},
			timeout: 3000
		});

		r.on('message', function (err, answer) {
			if (err) {
				log.error(err);
				return;
			}
			log.debug('upstream answer', answer.answer);
			for (var i = 0, it; (it = answer.answer[i]); i++) {
				res.answer.push(it);
			}
		});

		r.on('timeout', function () {
			log.debug('timeout');
			res.send();
		});

		r.on('end', function () {
			log.debug('end');
			res.send();
		});

		r.send();
	}

	var answer = answers[req.question[0].name];
	if (answer) {
		res.answer.push(dns.A({
			name: req.question[0].name,
			address: answer,
			ttl: 60
		}));
		res.send();
	} else {
		proxy();
	}
});

server.on('error', function (err, buff, req, res) {
	log.error(err.stack);
});

server.on('listening', function () {
	log.info('DNS on ', this.address());
});

server.serve(53);
