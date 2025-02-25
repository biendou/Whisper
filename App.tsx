import { View, Text, Button, Alert, Modal, ActivityIndicator, ToastAndroid, ScrollView, TextInput } from "react-native"
import { initWhisper } from 'whisper.rn'
import { useEffect, useRef, useState } from "react"
import { Audio } from "expo-av";
import { Recording } from "expo-av/build/Audio";
import RNFS from "react-native-fs";
import { FFmpegKit, Statistics } from "ffmpeg-kit-react-native";
import { Platform } from "react-native";
import { io } from "socket.io-client";
const MODEL_PATH = './ggml-tiny.bin'

import AudioRecord from 'react-native-audio-record';

const options = {
  sampleRate: 16000,  // default 44100
  channels: 1,        // 1 or 2, default 1
  bitsPerSample: 16,  // 8 or 16, default 16
  audioSource: 6,     // android only (see below)
  wavFile: 'test.wav' // default 'audio.wav'
};

const downloadPath = `${RNFS.DocumentDirectoryPath}/downloaded_file`;

const formatFileSize = (size: number) => {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(2)} KB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
};

const App = () => {
  const [isRealtime, setIsRealtime] = useState<boolean>(false);
  const [showStatistics, setShowStatistics] = useState<boolean>(false)
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
  const [sound, setSound] = useState<any>();
  const [status, setStatus] = useState<any>(null);
  const [isStreaming, setIsStreaming]= useState<boolean>(false)
  const [isStreamingOnSocket, setIsStreamingOnSocket]= useState<boolean>(false)
  const statistics = useRef<{
    isVisible: boolean,
    recordinStartTime?: number,
    recordingEndTime?: number,
    uploaStartTime?: number,
    updloadEndTime?: number,
    downLoadEndTime?: number,
    recordingDuration?: string,
    transcriptionStartTime?: number,
    transcriptionEndTime?: number,
    fileSize?: string,
    speechToTextTranslation?: string
  }>({isVisible: false})
  const socket = useRef<any>()


  useEffect(
    () => {
      const connection = io("http://10.0.2.2:8000");

      connection.on("download", async (fileData) => {
        console.log("📥 Fichier reçu du serveur");

        try {
          // Convert Base64 to a file
          if (typeof fileData !== "string") {
            console.error("❌ Invalid data format. Expected a string but got:", typeof fileData);
            return;
          }
          await RNFS.writeFile(downloadPath, fileData, "base64");
          const fileStat = await RNFS.stat(downloadPath);
          console.log("file stats", JSON.stringify(fileStat))
          console.log(`Taille du fichier: ${formatFileSize(fileStat.size)}`);
          statistics.current.fileSize = `${formatFileSize(fileStat.size)}`
          console.log("✅ Fichier téléchargé avec succès:", downloadPath);
          ToastAndroid.show(
            `Successfully save the file ${downloadPath} on disk !`,
            ToastAndroid.SHORT)
          // Alert.alert("Téléchargement terminé", `Le fichier a été enregistré: ${downloadPath}`);

        } catch (error) {
          console.error("❌ Erreur lors du téléchargement du fichier:", error);
          ToastAndroid.show(
            `Error while saving the file ${downloadPath} on disk !`,
            ToastAndroid.SHORT)
          // Alert.alert("Erreur", "Impossible de télécharger le fichier.");
        } finally {
          statistics.current.downLoadEndTime = Date.now();
        }
      });
      socket.current = connection
    }
    , [])


  const startSocketStreaming = () => {
    setIsStreaming(!isStreaming)
    AudioRecord.init(options);
    AudioRecord.on('data', data => {
      socket.current.emit("stream", data)
    });

    setIsRealTimeRecording(true)
    AudioRecord.start();
  }

  const stopSocketStreaming = async () => {
    setIsStreaming(!isStreaming)
    const audioFile = await AudioRecord.stop();
    console.log("file", audioFile)
    setIsRealTimeRecording(false)
  }


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
    setIsStreamingOnSocket(!isStreamingOnSocket)
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
    setIsStreamingOnSocket(!isStreamingOnSocket)
    await realTimeStopRef.current();
  }



  const transcribeWithWhisper = (uri: string) =>
    new Promise(async (resolve, reject) => {
      try {
        statistics.current.transcriptionStartTime = Date.now();
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
            statistics.current.speechToTextTranslation = content
            setRecognizedText(content);
          }

          resolve(res?.result);
        }
      } catch (error) {
        reject(error);
      } finally {
        statistics.current.transcriptionEndTime = Date.now();
      }
    });

  const startRecording = async () => {
    // if (permissionResponse?.status !== 'granted') {
    //   console.log('Requesting permission..');
    //   await requestPermission();
    // }
    setRecognizedText("")
    statistics.current = {isVisible: true}
    statistics.current.recordinStartTime = Date.now();
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
      statistics.current.recordingEndTime = Date.now()
      uri = recording?.getURI();
      // console.log("uri ", uri)
      await sendAudioToSocket(`${uri}`);
      await transcribeWithWhisper(uri as string);

    } catch (error) {
      console.error(error)
    } finally {
      setMessage(uri + "")
      setIsRecording(false);
    }

  };

  const sendAudioToSocket = async (uri: string) => {
    try {
      // Read the file as base64
      const base64Audio = await RNFS.readFile(uri.replace("file://", ""), "base64");
      statistics.current.uploaStartTime = Date.now()
      // Send audio data to the server
      socket.current.emit("upload", base64Audio, (response: any) => {
        if (response.message == "success") {

          ToastAndroid.show(
            'Message Uploaded Successfully !',
            ToastAndroid.LONG)
        } else {

          ToastAndroid.show(
            'Error when trying to upload message !',
            ToastAndroid.LONG)
        }
        statistics.current.updloadEndTime = Date.now();
      });
      // socket.current.emit("upload", base64Audio);
      console.log("Audio sent via Socket.IO!");
    } catch (error) {
      console.error("Error sending audio file:", error);
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
    const [intent1, setIntent1] = useState<string>("")
    const [intent2, setIntent2] = useState<string>("")
  return (
    <>
      <View style={{ alignItems: "center", justifyContent: "center", height: "100%", backgroundColor: "white", gap: 32, padding: 16 }}>

        <Button onPress={() => setIsRealtime(!isRealtime)} title={!isRealtime ? "Switch to Realtime Mode" : "Switch to Record Mode"} disabled={isRealtime ? isRealtimeRecording : isRecording || isPlaying}></Button>
        {!isRealtime && (
          <>
            <View style={{ gap: 16 }}>
              <Text style={{ fontSize: 32 }}>Recording Module</Text>
              <Button title={"Start"} onPress={startRecording} disabled={isRecording || isPlaying}></Button>
              <Button title={"Stop"} onPress={stopRecording} disabled={!isRecording || isPlaying}></Button>
              <View style={{flexDirection: "row", gap: 8, alignItems: "stretch"}}>
              <TextInput style={{backgroundColor: "grey", width: "56%", alignContent: "space-between"}} value={intent1} onChangeText={setIntent1 } placeholder="Please enter the intent" />
              {!intent1.length?<Button title={"NA"} color={"grey"}></Button>:(recognizedText.toLowerCase().includes(intent1.toLowerCase())?<Button title={"detected"} color={"green"}></Button>:<Button title={"Non detected"} color={"red"}></Button>)}
              </View>
              {statistics.current.isVisible &&<Button title={"Show Last recording stats"} onPress={() => setShowStatistics(!showStatistics)}></Button>}
              <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                <Button title={"Convert JFK sample"} onPress={converFile} disabled={isRecording || isPlaying}></Button>
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
              <Button title={"Start Socket streaming"} onPress={startSocketStreaming} disabled={isStreaming||isStreamingOnSocket} ></Button>
              <Button title={"Stop Socket streaming"} onPress={stopSocketStreaming} disabled={!isStreaming||isStreamingOnSocket}></Button>
            </View>
            <View style={{ gap: 16, alignSelf: "center" }}>
              <Button title={"Start realtime translation"} onPress={StartRealTimeTranslation} disabled={isStreamingOnSocket||isStreaming}></Button>
              <Button title={"Stop realtime translation"} onPress={stopRealTimeTranslation} disabled={!isStreamingOnSocket||isStreaming}></Button>
            </View>
            <View style={{flexDirection: "row", gap: 8, alignItems: "stretch"}}>
              <TextInput style={{backgroundColor: "grey", width: "56%", alignContent: "space-between"}} value={intent2} onChangeText={setIntent2 } placeholder="Please enter the intent" />
              {!intent2.length?<Button title={"NA"} color={"grey"}></Button>:(realTimeText.toLowerCase().includes(intent2.toLowerCase())?<Button title={"detected"} color={"green"}></Button>:<Button title={"Non detected"} color={"red"}></Button>)}
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
      <Modal
        visible={showStatistics}
        transparent={true}

      >
        <View style={{ alignItems: "center", justifyContent: "center", height: "100%", backgroundColor: "white" }}>
          <Button title={"Close"} onPress={() => setShowStatistics(!showStatistics)}></Button>
          <Text > Show statistics</Text>
          <View style={{ paddingVertical: 16, gap: 8 }}>
            <Text >{`recording duration: ${(statistics.current?.recordingEndTime - statistics.current?.recordinStartTime) / 1000} seconds`}</Text>
            <Text >{`Upload duration: ${(statistics.current?.updloadEndTime - statistics.current?.uploaStartTime)} ms`}</Text>
            <Text >{`Download duration: ${(-statistics.current?.updloadEndTime + statistics.current?.downLoadEndTime)} ms`}</Text>
            <Text >{`Transcription duration: ${(-statistics.current?.transcriptionStartTime + statistics.current?.transcriptionEndTime)/1000} s`}</Text>
            <Text >{`File Size: ${(statistics.current?.fileSize)}`}</Text>
            <Text >{`Translation: ${(statistics.current?.speechToTextTranslation)}`}</Text>
          </View>
          <Text >{`Other Informations`}</Text>
          <ScrollView contentContainerStyle={{ gap: 8 }}>


            {
              Object.entries(statistics.current).map((item) => {
                return (<View key={`${item[0]}`} style= {{paddingVertical: 4}}><Text>{`${item[0]}  ${item[1]}`}</Text></View>)
              })
            }
          </ScrollView>

        </View>
      </Modal>
    </>
  )
}

export default App;