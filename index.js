require('dotenv').config();
const spawn = require('child_process').spawn;
const fs = require('fs');
const express = require('express');
const request = require('request');
const ffmpeg = require('fluent-ffmpeg');
const cors = require('cors');
const mkdirp = require('mkdirp');

const dir = '/tmp/camera';

if (!process.env.MASTERSERVER || !process.env.NAME) {
    console.error('No master-server or name specified, or .env file is missing');
    process.exit(1);
}

mkdirp.sync(dir);

let masterServer = process.env.MASTERSERVER;
if (!masterServer.startsWith('http://')) {
	masterServer = 'http://' + process.env.MASTERSERVER;
}

let port = process.env.PORT || 8080;
let bitrateMultiplier = 1;
const heartbeatInterval = 300000;
let ffmpegInputOptions = [];
let ffmpegOutputOptions = ['-vcodec copy', '-use_localtime 1', '-hls_time 2', '-hls_list_size 2', '-hls_flags delete_segments+split_by_time', '-hls_segment_filename /tmp/camera/segment-%Y-%m-%d_%H-%M-%S.ts'];

let cameraStream = null;
let conversion = null;

function sendHearbeat() {
    console.log('Sending heartbeat to ' + masterServer + '/heartbeat');
    let heartbeatData = {
        name: process.env.NAME,
        fragment: "live.m3u8"
    };
    console.dir(heartbeatData);
    request.post(
        masterServer + '/heartbeat',
        {
            json: heartbeatData
        },
        function (error) {
            if (error) {
                console.error(`Failed to send heartbeat. ${error}`);
            } else {
                console.log('Heartbeat send success');
	    }
        }
    );
}

function launchStream() {
    cameraStream = spawn('raspivid', ['-o', '-', '-t', '0', '-n', '-h', '1080', '-w', '1920', '-ih', '-pf', 'baseline', '-fps', '15', '-g', '15', '-b', (bitrateMultiplier * 1000 * 1000).toString(), '-fl']);
    console.log(`Spawned raspivid with ${(bitrateMultiplier * 1000 * 1000)} bitrate`);
    conversion = new ffmpeg(cameraStream.stdout).noAudio().format('hls').inputOptions(ffmpegInputOptions).outputOptions(ffmpegOutputOptions).output(`/tmp/camera/live.m3u8`);
    cameraStream.stderr.on('data', function (data) {
        console.log('Camera info: ' + data.toString());
    });

    conversion.on('start', function(commandLine) {
        console.log('Spawned Ffmpeg with command: ' + commandLine);
    });

    conversion.on('error', function(err) {
        console.log('Cannot process video: ' + err);
        process.exit(1);
    });

    conversion.on('stderr', function (line) {
        console.log('Ffmpeg info: ' + line);
    });

    conversion.run();
}

let app = express();
app.use(cors());
app.use(`/`, express.static(dir));
app.listen(port);
console.log(`STARTING CAMERA STREAM SERVER AT PORT ${port}`);

launchStream();
sendHearbeat();
setInterval(sendHearbeat, heartbeatInterval);