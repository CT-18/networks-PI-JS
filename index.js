require('dotenv').config();
const spawn = require('child_process').spawn;
const fs = require('fs');
const request = require('request');
const EventEmitter = require('events');
const os = require('os');
const ip = require('ip');
const _ = require('lodash');
const mkdirp = require('mkdirp');

if (!process.env.MASTERSERVER || !process.env.NAME || !process.env.MASTERSERVERIP) {
    console.error('No master-server or name specified, or .env file is missing');
    process.exit(1);
}

if (!process.env.SEGMENTSPATH) {
    console.error('Path for segments is not specified. Exiting');
    process.exit(1);
}

console.log('Trying to create directory ' + process.env.SEGMENTSPATH);
mkdirp.sync(process.env.PATH); //create directory

let myip = null;
let myInterfaces = os.networkInterfaces();
const family = ip.isV4Format(process.env.MASTERSERVERIP) ? 'IPv4': 'IPv6';

_.each(myInterfaces, (inter) => {
    _.each(inter, (config) => {
        if (config.family !== family) { return; }

        if (ip.cidrSubnet(config.cidr).contains(process.env.MASTERSERVERIP)) {
            myip = config.address;
            console.log('My ip in MasterServer network: ' + myip);
        }
    });
});

if(!myip) {
    console.error('MasterServer network is unreachable');
    process.exit(1);
}

let crf = 30; // Bitrate option in x264 codec
const heartbeatInterval = 300000;

function sendHearbeat() {
    console.log('Sending heartbeat to ' + process.env.MASTERSERVER + '/heartbeat');
    let heartbeatData = {
        baseUrl: 'http://' + myip,
        name: process.env.NAME,
        fragment: "live.m3u8"
    };
    console.dir(heartbeatData);
    request.post(
        process.env.MASTERSERVER + '/heartbeat',
        {
            json: heartbeatData
        },
        function (error) {
            if (error) {
                console.error(`Something wrong with heartbeat request. error: ${error}`);
            }
        }
    );
}

function generateFfmpegOptions(crf) {
    return ['-loglevel', 'panic', '-i', '/dev/video0', '-f', 'v4l2', '-c:v', 'libx264', '-r', '8', '-g', '8', '-crf', crf.toString(),
        '-pix_fmt', 'yuv420p', '-tune', 'zerolatency', '-profile:v', 'baseline', '-preset:v', 'ultrafast', '-map', '0',
        '-f', 'hls', '-use_localtime', '1', '-hls_time', '2', '-hls_list_size', '3', '-hls_flags', 'delete_segments',
        '-hls_segment_filename', process.env.SEGMENTSPATH + '/segment-%Y-%m-%d_%H-%M-%S.ts', process.env.SEGMENTSPATH + '/live.m3u8'];
}

class Ffmpeg extends EventEmitter {
    constructor(options) {
        super(options);

        this.crf = options.crf;
        this.options = generateFfmpegOptions(this.crf);
        console.log('Starting FFMPEG with options: ' + this.options);
        this.ffmpegProcess = spawn('ffmpeg', this.options);

        this.ffmpegProcess.stdout.on('data', (data) => this.emit('data', data));
        this.ffmpegProcess.stderr.on('data', (data) => this.emit('error', data));
    }

    die() {
        this.ffmpegProcess.kill('SIGTERM');
    }
}

let ffmpeg = new Ffmpeg({crf: crf});
ffmpeg.on('error', (data) => {
    fs.appendFileSync('daemon-errors.log', data.toString(), 'utf8');
    console.error('FFmpeg throwed an error. Exiting');
    process.exit(1);
});
ffmpeg.on('data', (data) => {
    fs.appendFileSync('daemon-data.log', data.toString(), 'utf8');
});

sendHearbeat();
setInterval(sendHearbeat, heartbeatInterval);
