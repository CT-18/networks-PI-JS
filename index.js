require('dotenv').config();
const spawn = require('child_process').spawn;
const request = require('request');

if (!process.env.MASTERSERVER || !process.env.NAME) {
    console.error('No master-server or name specified, or .env file is missing');
    process.exit(1);
}

const heartbeatInterval = 300000;
let port = process.env.PORT || 8080;
let bitrate = 3 * 1000 * 1000;
let cvlcParams = ['-vvv', '-', '--sout', `#rtp{sdp=rtsp://:${port}/}`, ':demux=h264'];

function sendHearbeat() {
    console.log('Sending heartbeat to ' + process.env.MASTERSERVER + '/heartbeat');
    let heartbeatData = {
        baseUrl: 'http://0.0.0.0',
        name: process.env.NAME,
        fragment: '/'
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
let cvlc = spawn('cvlc', cvlcParams, {stdio: [cameraStream.stdout]});
cvlc.stderr.pipe(process.stdout);


sendHearbeat();
setInterval(sendHearbeat, heartbeatInterval);
