//#!node

var dns = require('native-dns');
var fs = require('fs');
var log = require('bunyan').createLogger({ name : 'dedns', level: process.env.LOG_LEVEL });

var program = require('commander');

program.
	version('0.0.1').
	usage('[options] [files...] (require sudo)').
	parse(process.argv);

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

function myIpAddress() {
	var interfaces = require('os').networkInterfaces();
	for (var key in interfaces) if (interfaces.hasOwnProperty(key)) {
		var addresses = interfaces[key];
		for (var i = 0, it; (it = addresses[i]); i++) {
			if (it.internal) continue;
			if (it.family === 'IPv6') continue;
			console.log(it.address);
		}
	}
}

var files = program.args;
if (!files.length) files.push('/etc/hosts');
var answers = [];
for (var i = 0, len = files.length; i < len; i++) {
	log.info('Use', files[i]);
	answers = answers.concat(parseHosts(fs.readFileSync(files[i], 'utf-8')));
}
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

	// ip address host name
	if (req.question[0].name.match(/(\d+\.\d+\.\d+\.\d).qrz/)) {
		res.answer.push(dns.A({
			name: req.question[0].name,
			address: RegExp.$1,
			ttl: 60
		}));
		res.send();
		return;
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
