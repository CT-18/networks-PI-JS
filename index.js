require('dotenv').config();
const spawn = require('child_process').spawn;
const express = require('express');
const request = require('request');
const ffmpeg = require('fluent-ffmpeg');
const cors = require('cors');
const mkdirp = require('mkdirp');

if (!process.env.MASTERSERVER || !process.env.NAME) {
    console.error('No master-server or name specified, or .env file is missing');
    process.exit(1);
}

mkdirp.sync('/tmp/camera');

let masterServer = process.env.MASTERSERVER;
if (!masterServer.startsWith('http://')) {
	masterServer = 'http://' + process.env.MASTERSERVER;
}

let port = process.env.PORT || 8080;
let bitrate = 3 * 1000 * 1000;
const heartbeatInterval = 300000;
let ffmpegInputOptions = ['-re'];
let ffmpegOutputOptions = ['-vcodec copy', '-use_localtime 1', '-hls_time 1', '-hls_list_size 4', '-hls_flags delete_segments+split_by_time', '-hls_segment_filename /tmp/camera/segment-%Y-%m-%d_%H-%M-%S.ts'];

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
                console.error(`Something wrong with heartbeat request. error: ${error}`);
            }
        }
    );
}

function generateRaspividOptions(bitrate) {
    return ['-o', '-', '-t', '0', '-n', '-h', '1080', '-w', '1920', '-ih', '-pf', 'baseline', '-fps', '30', '-g', '30', '-b', bitrate.toString(), '-fl'];
}
let cameraStream = spawn('raspivid', generateRaspividOptions(bitrate));
let conversion = new ffmpeg(cameraStream.stdout).noAudio().format('hls').inputOptions(ffmpegInputOptions).outputOptions(ffmpegOutputOptions).output(`/tmp/camera/live.m3u8`);
cameraStream.stderr.on('data', function (data) {
    console.log('Error while connecting to camera: ' + data.toString());
    process.exit(1);
});
conversion.on('error', function(err, stdout, stderr) {
    console.log('Cannot process video: ' + err.message);
    process.exit(1);
});

conversion.on('start', function(commandLine) {
    console.log('Spawned Ffmpeg with command: ' + commandLine);
});

conversion.on('stderr', function(stderrLine) {
    console.log('Stderr output: ' + stderrLine);
});

conversion.run();
let app = express();

app.use(cors());


app.use(`/`, express.static('/tmp/camera'));

app.listen(port);
console.log(`STARTING CAMERA STREAM SERVER AT PORT ${port}`);

sendHearbeat();
setInterval(sendHearbeat, heartbeatInterval);
