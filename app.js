import express from 'express'
import fs from 'fs'
import { createFFmpeg, fetchFile } from '@ffmpeg/ffmpeg'
import SpeechToTextV1 from 'ibm-watson/speech-to-text/v1.js'
import { IamAuthenticator } from 'ibm-watson/auth/index.js'
import 'dotenv/config'

const app = express();
const PORT = process.env.PORT || 3001;

app.use((_, res, next) => {
  res.header('Cross-Origin-Opener-Policy', 'same-origin');
  res.header('Cross-Origin-Embedder-Policy', 'require-corp');
  next();
});

app.use(express.static('build'));
const ffmpeg = createFFmpeg({ log : true})

  const speechToText = new SpeechToTextV1({
    authenticator: new IamAuthenticator({
      apikey: process.env.IBM_WATSON_API_KEY,
    }),
    serviceUrl: "https://api.au-syd.speech-to-text.watson.cloud.ibm.com/instances/31772479-c3bf-4b4d-b14a-abffd0d43d11",
  });

// Extract audio (.aac) from an in-folder video
// ffmpeg -i input-video.avi -vn -acodec copy output-audio.aac
app.get('/extract', (req,res)=> {

  (async () => {
    await ffmpeg.load()
    ffmpeg.FS("writeFile", "shennan_video.mp4", await fetchFile("./shennan_video.mp4"))
    await ffmpeg.run('-i', 'shennan_video.mp4', '-vn', '-acodec', 'copy', 'audio.aac')
    await fs.promises.writeFile('./audio.aac', ffmpeg.FS('readFile','audio.aac'))
    process.exit(0)
  })()

})

// Generates the waveform of the audiofile
//ffmpeg -i input -filter_complex "showwavespic=s=640x120" -frames:v 1 output.png
app.get('/waveform', (req,res)=> {
  (async () => {
    await ffmpeg.load()
    ffmpeg.FS("writeFile", "audio.aac", await fetchFile("./audio.aac"))
    await ffmpeg.run('-i', 'audio.aac', '-filter_complex', 'showwavespic=s=640x120', '-frames:v', '1', 'output.png')
    await fs.promises.writeFile('./output.png', ffmpeg.FS('readFile','./output.png'))
    process.exit(0)
  })()
})

// Runs transcription service from IBM Watson
app.get('/transcribe', (req,res)=> {
  
  //https://cloud.ibm.com/apidocs/speech-to-text?code=node#endpoint-cloud
  const params = {
    objectMode: true, // If true, the event handler returns the recognition results exactly as it receives them from the service: as one or more instances of a SpeechRecognitionResults object. 
    contentType: 'application/octet-stream',
    model: 'en-US_BroadbandModel',
    maxAlternatives: 2,
    interimResults: true,
    timestamps: true,
    profanityFilter: true,
    smartFormatting: true,
    speakerLabels:true,
    processingMetrics: true,
    audioMetrics: true,
    endOfPhraseSilenceTime: 0.8, //default: 0.8
    splitTranscriptAtPhraseEnd: true,
    speechDetectorSensitivity: 0.5, //default: 0.5, 1.0 suppresses no audio
    backgroundAudioSuppression: 0.0, //default:0.0, 1.0 suppresses all audio
  }

  // create the stream
  const recognizeStream = speechToText.recognizeUsingWebSocket(params);
  recognizeStream.setEncoding('utf8');
  fs.createReadStream('./audio.aac').pipe(recognizeStream)
  recognizeStream.pipe(fs.createWriteStream('transcription.txt'));
  recognizeStream.on('data', function(event) { onEvent('Data:', event); });
  recognizeStream.on('error', function(event) { onEvent('Error:', event); });
  recognizeStream.on('close', function(event) { onEvent('Close:', event); });

  // Display events on the console.
  function onEvent(name, event) {
      console.log(name, JSON.stringify(event, null, 2));
  };
})


app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}...`);
});