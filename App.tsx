import { View, Text, Button } from "react-native"
import { initWhisper } from 'whisper.rn'
import { useEffect, useRef, useState } from "react"
import { Audio } from "expo-av";
import { Recording } from "expo-av/build/Audio";
import RNFS from "react-native-fs";
import { FFmpegKit } from "ffmpeg-kit-react-native";
import { Platform } from "react-native";

const translation = async () => {
          const whisperContext = await initWhisper({
          filePath: require('./ggml-tiny.bin'),
          })
          const options = { 
            // maxThreads: 8,
            language: 'en',
            realtimeAudioSec: 60*5,
            realtimeAudioSliceSec: 5
           }

          const { stop, subscribe } = await whisperContext.transcribeRealtime(options)

          subscribe(evt => {
            const { isCapturing, data, processTime, recordingTime, slices } = evt
            // const {ode, error, data: chunck, processTime: chunkProcessTime, recordingTime: Chunk recordTime} = slices

            console.log(
              `Realtime transcribing: ${isCapturing ? 'ON' : 'OFF'}\n` +
                // The inference text result from audio record:
                `Result: ${JSON.stringify(slices)}\n\n` +
                `Process time: ${processTime}ms\n` +
                `Recording time: ${recordingTime}ms`,
            )
            if (!isCapturing) console.log('Finished realtime transcribing')
          })

          // const sampleFilePath = './jfk.wav'
          // const options = { language: 'en' }
          // const { stop, promise } = whisperContext.transcribe(sampleFilePath, options)
          // const { result } = await promise
          //  return "Hello World"
          // return result
        }

const App = () => {
  const [message, setMessage] = useState<string>("Hello World")
  const [isRecording, setIsRecording] = useState(false);
  const [recording, setRecording] = useState<Recording>();
  const [permissionResponse, requestPermission] = Audio.usePermissions();
  const [recognizedText, setRecognizedText] = useState<string>("");
  const [isTranscribing, setIsTranscribing] = useState(false);
  const whisper = useRef<any>();
  useEffect(
     ()=> {

      translation()
      // let counter = 0; 
      // const intervalle = setInterval(
      //   ()=>{
      //     console.log(message)
      //     setMessage(counter++)
      //   }, 1000)
      // return()=> clearInterval(intervalle)
    }
  ,[])

  // useEffect(() => {
  //   (async () => {
  //     try {
  //       const context = await initWhisper({
  //         filePath: require('./ggml-tiny.bin'),
  //       });
  //       whisper.current = context;
  //     } catch (error) {
  //       console.error(error)
  //     } finally {
  //       console.log("model loaded")
  //     }

  //   })();
  // }, []);

  const transcribeWithWhisper = (uri: string) =>
    new Promise(async (resolve, reject) => {
      try {
        if (Platform.OS === "android") {
          const sourceUri = uri;
          const targetFile = RNFS.DocumentDirectoryPath + "/newFile.wav"; // Example target directory
          await FFmpegKit.execute(
            `-y -i ${sourceUri} -ar 16000 -ac 1 -c:a pcm_s16le ${targetFile}`
          );
          const transcription = whisper.current?.transcribe(targetFile, {
            language: "en",
            maxLen: 1,
            translate: true,
            onProgress: (cur) => {
              if (cur < 100) {
                setIsTranscribing(true);
              } else {
                setIsTranscribing(false);
              }
            },
          });

          const res = await transcription?.promise;

          if (res?.result) {
            const content = res.result    //.trim().replaceAll("[BLANK_AUDIO]", "");

            setRecognizedText(content);
          }

          resolve(res?.result);
        }
      } catch (error) {
        reject(error);
      }
    });

  const startRecording = async () => {
    if (permissionResponse?.status !== 'granted') {
      console.log('Requesting permission..');
      await requestPermission();
    }
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });

    console.log('Starting recording..');

    setIsRecording(true);
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });

    const recordingOptions = {
      // Android only, AAC encoding is supported by most browsers and devices
      android: {
        extension: ".wav",
        outputFormat: Audio.RECORDING_OPTION_ANDROID_OUTPUT_FORMAT_DEFAULT,
        audioEncoder: Audio.RECORDING_OPTION_ANDROID_AUDIO_ENCODER_DEFAULT,
        sampleRate: 16000,
        numberOfChannels: 1,
        bitRate: 256000,
      },
      // iOS only, linear PCM encoding (WAV is a container for PCM data)
      ios: {
        extension: ".wav",
        outputFormat: Audio.RECORDING_OPTION_IOS_OUTPUT_FORMAT_LINEARPCM,
        audioQuality: Audio.RECORDING_OPTION_IOS_AUDIO_QUALITY_MAX,
        sampleRate: 16000,
        numberOfChannels: 1,
        bitRate: 256000,
        linearPCMBitDepth: 16,
        linearPCMIsBigEndian: false,
        linearPCMIsFloat: false,
      },
    };

    const { recording } = await Audio.Recording.createAsync(
      recordingOptions as any
    );
    setRecording(recording);
  };

  const stopRecording = async () => {
    let uri
    try {
      const context = await initWhisper({
        filePath: require('./ggml-tiny.bin'),
      });
      await recording?.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
      });
      uri = recording?.getURI();
      await transcribeWithWhisper(uri as string);
    } catch (error) {
      console.error(error)
    } finally {
      setMessage(uri + "")
      setIsRecording(false);
    }
    
  };

  return (
    <View style={{ alignItems: "center", justifyContent: "center", height: "100%" }}>
      <Button title={"Start"} onPress={startRecording}></Button>
      <Button title={"Stop"} onPress={stopRecording}></Button>
      <Text style={{ fontSize: 50 }}>{recognizedText}</Text>
    </View>
  )
}

export default App;