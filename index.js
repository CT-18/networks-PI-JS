require('dotenv').config();
const spawn = require('child_process').spawn;
const ffmpeg = require('fluent-ffmpeg');
const request = require('request');

if (!process.env.MASTERSERVER || !process.env.NAME) {
    console.error('No master-server or name specified, or .env file is missing');
    process.exit(1);
}

const heartbeatInterval = 300000;
let bitrate = 5 * 1000 * 1000;
let ffmpegInputOptions = ['-f', 'h264'];
let ffmpegOutputOptions = ['-vcodec copy', '-rtmp_live', 'live'];

function sendHearbeat() {
    console.log('Sending heartbeat to ' + process.env.MASTERSERVER + '/heartbeat');
    let heartbeatData = {
        name: process.env.NAME,
        fragment: process.env.RTMPPATH
    };
    console.dir(heartbeatData);
    request.post(
        process.env.MASTERSERVER + '/heartbeat',
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

function generateRaspividOptions(bitrate) {
    return ['-o', '-', '-t', '0', '-n', '-h', '1080', '-w', '1920', '-ih', '-fps', '30', '-b', bitrate.toString(), '-fl'];
}
let cameraStream = spawn('raspivid', generateRaspividOptions(bitrate));
let conversion = new ffmpeg(cameraStream.stdout).noAudio().inputOptions(ffmpegInputOptions).outputOptions(ffmpegOutputOptions).format('flv').output(`rtmp://127.0.0.1${process.env.RTMPPATH}`);

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

sendHearbeat();
setInterval(sendHearbeat, heartbeatInterval);
