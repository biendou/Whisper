import { View, Text, Button, Alert, Modal, ActivityIndicator, ToastAndroid, ScrollView } from "react-native"
import { initWhisper } from 'whisper.rn'
import { useEffect, useRef, useState } from "react"
import { Audio } from "expo-av";
import { Recording } from "expo-av/build/Audio";
import RNFS from "react-native-fs";
import { FFmpegKit } from "ffmpeg-kit-react-native";
import { Platform } from "react-native";

const MODEL_PATH = './ggml-tiny.bin'

const App = () => {
  const [isRealtime, setIsRealtime] = useState<boolean>(false)
  const [message, setMessage] = useState<string>("Hello World")
  const [isRecording, setIsRecording] = useState(false);
  const [recording, setRecording] = useState<Recording>();
  const [permissionResponse, requestPermission] = Audio.usePermissions();
  const [recognizedText, setRecognizedText] = useState<string>("");
  const [realTimeText, setRealTimeText] = useState<string>("")
  const [isTranscribing, setIsTranscribing] = useState(false);
  const whisper = useRef<any>();
  const realTimeStopRef = useRef<any>();
  const [isRealtimeRecording, setIsRealTimeRecording] = useState<boolean>(false)
  const [isModalVisible, setIsModalVisible] = useState<boolean>(false);
  const [isError, setIsError] = useState<boolean>(false)
  const [erroMessage, setErrorMessage] = useState<string>("")

  useEffect(() => {
    (async () => {
      if (permissionResponse?.status !== 'granted') {
        console.log('Requesting permission..');
        await requestPermission();
      }
      try {
        const context = await initWhisper({
          filePath: require(MODEL_PATH),
        });
        whisper.current = context;
      } catch (error) {
        console.error(error)
        setErrorMessage(JSON.stringify(error))
        setIsError(true)
        // Alert.alert("Error when Loading the model", JSON.stringify(error))
      } finally {
        ToastAndroid.show(
          `Model ${MODEL_PATH} Loaded !`,
          ToastAndroid.LONG)
        // Alert.alert("model Loaded")
      }
    })();
  }, []);

  const StartRealTimeTranslation = async () => {
    setRealTimeText("")
    const whisperContext = whisper.current
    const options = {
      // maxThreads: 8,
      language: 'en',
      realtimeAudioSec: 60 * 5,
      realtimeAudioSliceSec: 5
    }

    const { stop, subscribe } = await whisperContext.transcribeRealtime(options)
    realTimeStopRef.current = stop;
    subscribe((event: { isCapturing: any; data: any; processTime: any; recordingTime: any; slices: any; }) => {
      const { isCapturing, data, processTime, recordingTime, slices } = event
      // const {ode, error, data: chunck, processTime: chunkProcessTime, recordingTime: Chunk recordTime} = slices
      setRealTimeText(data.result)
      console.log(
        `Realtime transcribing: ${isCapturing ? 'ON' : 'OFF'}\n` +
        // The inference text result from audio record:
        `Result: ${JSON.stringify(slices)}\n\n` +
        `Process time: ${processTime}ms\n` +
        `Recording time: ${recordingTime}ms`,
      )
      if (!isCapturing) {
        setIsModalVisible(false)
        setIsRealTimeRecording(false)
        ToastAndroid.show(
          'Finished realtime transcribing !',
          ToastAndroid.LONG)
        console.log('Finished realtime transcribing')
      }
    })
    setIsRealTimeRecording(true)
    ToastAndroid.show(
      'Started realtime transcribing !',
      ToastAndroid.LONG)
    // const sampleFilePath = './jfk.wav'
    // const options = { language: 'en' }
    // const { stop, promise } = whisperContext.transcribe(sampleFilePath, options)
    // const { result } = await promise
    //  return "Hello World"
    // return result
  }

  const stopRealTimeTranslation = async () => {
    setIsModalVisible(true)
    await realTimeStopRef.current();
  }



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
            onProgress: (cur: number) => {
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
    // if (permissionResponse?.status !== 'granted') {
    //   console.log('Requesting permission..');
    //   await requestPermission();
    // }
    setRecognizedText("")
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });

    ToastAndroid.show(
      'Starting recording..',
      ToastAndroid.LONG)
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

  const [sound, setSound] = useState<any>();
  const [status, setStatus] = useState<any>(null);

  async function playSound() {
    ToastAndroid.show(
      'Loading Sound',
      ToastAndroid.LONG)
    console.log('Loading Sound');
    const { sound } = await Audio.Sound.createAsync(
      require('./jfk.wav') // Replace with your audio file path
      ,
      {},
      (status) => setStatus(status)
    );
    setSound(sound);
    ToastAndroid.show(
      'Playing Sound',
      ToastAndroid.LONG)
    console.log('Playing Sound');
    await sound.playAsync();
    // setIsTranscribing(false)
  }
  async function pauseSound() {
    if (sound) {
       await sound.pauseAsync();
    }
 }

  useEffect(() => {
    return sound
      ? () => {
          console.log('Unloading Sound');
          sound.unloadAsync();
        }
      : undefined;
  }, [sound]);

  const stopRecording = async () => {
    let uri
    try {
      // const context = await initWhisper({
      //   filePath: require('./ggml-tiny.bin'),
      // });
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

  const converFile = async () => {
    setRecognizedText("")
    setIsTranscribing(true)
    try {
      ToastAndroid.show(
        'Starting conversion..',
        ToastAndroid.LONG)
      const { stop, promise } = whisper.current?.transcribe(require('./jfk.wav'), {
        language: "en",
        maxLen: 1,
        translate: true,
        onProgress: (cur: number) => {
          if (cur < 100) {
            setIsTranscribing(true);
          } else {
            setIsTranscribing(false);
          }
        },
      })
      const res = await promise;
      if (res?.result) {
        const content = res.result    //.trim().replaceAll("[BLANK_AUDIO]", "");
        setRecognizedText(content);
      }
    } catch (error) {
      console.error("Error during the transcription", error)
    } finally {
      setIsTranscribing(false)
    }
  }
  const isPlaying = status?.isPlaying
  if (permissionResponse?.status == 'denied' || isError)
    return (
      <View style={{ alignItems: "center", justifyContent: "center", height: "100%", backgroundColor: "white", gap: 32, padding: 16 }}>
        {isError ? <Text style={{ textAlign: "center", fontSize: 16 }}>{`An fatal error Happened, please try to restart the app \n\n\n ${erroMessage} `}</Text> : <Text>Please head to this app setup and grant the required permission to be able to use the app</Text>}
      </View>
    )
  return (
    <>
      <View style={{ alignItems: "center", justifyContent: "center", height: "100%", backgroundColor: "white", gap: 32, padding: 16 }}>

        <Button onPress={() => setIsRealtime(!isRealtime)} title={!isRealtime ? "Switch to Realtime Mode" : "Switch to Record Mode"}></Button>
        {!isRealtime && (
          <>
            <View style={{ gap: 16 }}>
              <Text style={{ fontSize: 32 }}>Recording Module</Text>
              <Button title={"Start"} onPress={startRecording} disabled={isRecording||isPlaying}></Button>
              <Button title={"Stop"} onPress={stopRecording} disabled={!isRecording||isPlaying}></Button>
              <View style={{flexDirection: "row", gap: 8}}>
              <Button title={"Convert JFK sample"} onPress={converFile} disabled={isRecording||isPlaying}></Button>
              <Button title={status?.isPlaying ? 'Stop' : 'Play'} onPress={status?.isPlaying ? pauseSound : playSound} disabled={isRecording}></Button>
              </View>
            </View>
            <ScrollView style={{ backgroundColor: "grey", width: "100%" }}>
              <View>
                <Text style={{ fontSize: 18, color: "white" }}>{recognizedText}</Text>
              </View>
            </ScrollView>
          </>
        )
        }
        {isRealtime && (
          <>
            <View>
              <Text style={{ fontSize: 32, textAlign: "center" }}>Real time translation Module</Text>
            </View>
            <View style={{ gap: 16, alignSelf: "center" }}>
              <Button title={"Start realtime translation"} onPress={StartRealTimeTranslation} disabled={isRealtimeRecording}></Button>
              <Button title={"Stop realtime translation"} onPress={stopRealTimeTranslation} disabled={!isRealtimeRecording}></Button>
            </View>
            <ScrollView style={{ backgroundColor: "grey", width: "100%" }}>
              <View>
                <Text style={{ fontSize: 18, color: "white" }}>{realTimeText}</Text>
              </View>
            </ScrollView>
          </>
        )
        }


      </View>
      <Modal
        visible={isModalVisible || isTranscribing}
        transparent={true}
        style={{ alignItems: "center", justifyContent: "center", height: "100%" }}
      >
        <View style={{ alignItems: "center", justifyContent: "center", height: "100%" }}>
          <ActivityIndicator size="large" />
        </View>
      </Modal>
    </>
  )
}

export default App;