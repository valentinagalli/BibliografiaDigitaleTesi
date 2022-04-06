const FFmpeg = require('fluent-ffmpeg')
const concat = require('ffmpeg-concat')
const { on } = require('events')
const axios = require('axios')
const fs = require('fs')
const { dir } = require('console')

async function videoEsportazione(fileJson) {

    // creazione cartella di file temporanei ed il file finale
    let prefix = String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
    let dir_name = fs.mkdtempSync("/var/www/html/exports/" + prefix);
	
    // percorsi
    const video_params = {
        'dir_name': dir_name,
        'videoPerAudio': dir_name + '/export_videoPerAudio.mp4',
        'audio_path': dir_name + '/export_audioConcatenato.mp3',
        'lunghBase': 5,
        'videoTitolo': dir_name + '/export_titolo.mp4',
        'videoCrediti': dir_name + '/export_crediti.mp4',
        'videoConcat': dir_name + '/export_senzaTesto.mp4',
        'videoFine': dir_name + '_.mp4',
        'arrayTesti': arrayTesti
    }
	
	// dichiarazione variabili e array
	var arrayTesti = []
    var lunghCred = video_params.lunghBase + fileJson["segments"].length
    video_params.lunghCred = lunghCred
    const outro = 'files_export/outro.mp4'
    var arrayPaths = []    
    var arrayPathsAudio = []    
    video_params.arrayPathsAudio = arrayPathsAudio;	
    var creditiVideo = []    
    var nomeAutore = fileJson["author"] 
    var titoloRemix = fileJson["title"] 
    var datiVideo = []
    var datiAudio = []
    var creditiAudio = []
    video_params.arrayTesti = arrayTesti;	

    // divide l'array di dizionari "segments" in un array video e uno audio
    var j = 0
    var k = 0
    for (var i = 0; i < fileJson["segments"].length; i++) {
        if (fileJson["segments"][i]["trackRef"] == 'musicTrack1') {
            datiAudio[j] = fileJson["segments"][i]
            j++
        } else if (fileJson["segments"][i]["trackRef"] == 'videoTrack1') {
            datiVideo[k] = fileJson["segments"][i]
            k++
        } else {
            console.log("error")
        }
    }

    // converte i valori di timeStart e timeEnd per ogni video nell'array di dizionari "segments"
    for (var i = 0; i < datiVideo.length; i++) {
        const tempoStart = datiVideo[i]["timeStart"]
        const tempoEnd = datiVideo[i]["timeEnd"]

        datiVideo[i]["timeStart"] = convertToSec(tempoStart) + Number(video_params.lunghBase)
        datiVideo[i]["timeEnd"] = convertToSec(tempoEnd) + Number(video_params.lunghBase)
    }

    // crea i path e la stringa crediti per i segmenti selezionati come audio
    for (var i = 0; i < datiAudio.length; i++) {
        arrayPathsAudio[i + 1] = dir_name + '/' + datiAudio[i]["videoId"] + '_' + datiAudio[i]["segmentId"] + '_cut.mp4'
        arrayPathsAudio[0] = 'files_export/audio.mp4'

        url = "http://remix.unipi.it:3000/api/0.1/film_info/" + datiAudio[i]["videoId"]
        let value = await axios.post(url)
        creditiAudio.push("\n\n" + (i + 1) + ". " + value.data.phx_title + ", " + value.data.phx_director + "\n" + value.data.phx_country + ", " + value.data.phx_year + "\n" + value.data["Archivio di conservazione"] + " (" + value.data.Inventario + ")");
    }
    const audioString = arrayPathsAudio.toString()
    video_params.audioString = audioString

    // crea i path e la stringa crediti per i segmenti selezionati come video
    for (var i = 0; i < datiVideo.length; i++) {
        arrayPaths[i] = dir_name + '/' + datiVideo[i]["videoId"] + '_' + datiVideo[i]["segmentId"] + '_cut.mp4'
        url = "http://remix.unipi.it:3000/api/0.1/film_info/" + datiVideo[i]["videoId"]
        let value = await axios.post(url)
        creditiVideo.push("\n\n" + (i + 1) + ". " + value.data.phx_title + ", " + value.data.phx_director + "\n" + value.data.phx_country + ", " + value.data.phx_year + "\n" + value.data["Archivio di conservazione"] + " (" + value.data.Inventario + ")")
        const textInput = value.data.phx_title + ", " + value.data.phx_director
        arrayTesti[i] = "drawtext=text= '" + textInput + "': fontsize=20: fontcolor=white: box=1: boxcolor=black@0.25: boxborderw=5: x=(w-text_w)/2: y=20: enable='between(t," + datiVideo[i]["timeStart"] + "," + datiVideo[i]["timeEnd"] + ")'"

        var testoTitolo = "\"" + titoloRemix + "\",\n\ncreato da " + nomeAutore + "\n\n" + getDate()
        video_params.testoTitolo = testoTitolo
    }

    const videoString = video_params.videoTitolo + ',' + arrayPaths + ',' + video_params.videoCrediti + ',' + outro
    video_params.videoString = videoString

	// trasformo l'array dei crediti in una stringa
    if (video_params.arrayPathsAudio.length > 0) {
        testoCrediti = "\nTracce video \n" + creditiVideo.join(" ") + "\n\n\nTracce audio\n" + creditiAudio.join(" ")
    } else {
        testoCrediti = "\nTracce video \n" + creditiVideo.join(" ")
    } 
    video_params.testoCrediti = testoCrediti

    await Promise.all(cutVids(fileJson, dir_name));
    await createVideo(video_params, fileJson)
}
async function createVideo(params, fileJson) {
    try {
		// se vi sono segmenti nella traccia audio, creo la traccia mp3
        if (params.arrayPathsAudio.length > 0) {
			// concatenazione del video per traccia audio
            await concat({
                output: params.videoPerAudio,
                videos: params.audioString.split(','),
                transition: {
                    name: "fade",
                    duration: 0
                }
            })
            // attendo la creazione della traccia audio, e dei video di titolo e crediti
            await Promise.all([makeAudio(params.videoPerAudio, params.audio_path), makeTitle(params.testoTitolo, params.lunghBase, params.videoTitolo), makeCredits(params.testoCrediti, params.lunghCred, params.videoCrediti)])
			// concateno il video base con la nuova traccia audio
            await concat({
                output: params.videoConcat,
                videos: params.videoString.split(','),
                audio: params.audio_path,
                transition: {
                    name: "fade",
                    duration: 0
                }
            })
            // aggiungo il testo sincronizzato al cambio video
            FFmpeg({ source: params.videoConcat })
                .withVideoFilters(params.arrayTesti.toString())
                .saveToFile(params.videoFine).on('error', console.error)
            console.log("end")
			// elimino i file superflui
            fs.unlinkSync(params.videoPerAudio)
            fs.unlinkSync(params.audio_path)
        } else { // se non ci sono segmenti nella traccia audio, procedo direttamente alla concatenazione del video
			// attendo la creazione dei video di titolo e crediti
            await Promise.all([makeTitle(params.testoTitolo, params.lunghBase, params.videoTitolo), makeCredits(params.testoCrediti, params.lunghCred, params.videoCrediti)])
			// concateno il video base
            await concat({
                output: params.videoConcat,
                videos: params.videoString.split(','),
                transition: {
                    name: "fade",
                    duration: 0
                }
            })
            // aggiungo il testo sincronizzato al cambio video
            await new Promise((resolve, reject) => {
                FFmpeg({ source: params.videoConcat })
                    .withVideoFilters(params.arrayTesti.toString())
                    .saveToFile(params.videoFine).on('error', reject).on('end', resolve)
                console.log("end")
            });
        }
		// elimino i file superflui
        fs.unlinkSync(params.videoTitolo)
        fs.unlinkSync(params.videoCrediti)
        let cutPaths = []
        for (var i = 0; i < fileJson["segments"].length; i++) {
            cutPaths[i] = params.dir_name + '/' + fileJson["segments"][i]["videoId"] + '_' + fileJson["segments"][i]["segmentId"] + '_cut.mp4'
            fs.unlinkSync(cutPaths[i])
        }
    } catch (err) {
        console.log(err)
    }
}

// funzione per convertire in sec il formato time dei metadata
function convertToSec(time) {
    ms = time.split(":")
    s = Number(ms[0]) * 60 + Number(ms[1])
    return s
}

// funzione per ottenere la data da stampare nel titolo
function getDate() {
    let ts = Date.now();
    let date_ob = new Date(ts)
    let date = date_ob.getDate()
    let month = date_ob.getMonth() + 1
    let year = date_ob.getFullYear()

    if (month == 1) { month = "gennaio" }
    else if (month == 2) { month = "febbraio" }
    else if (month == 3) { month = "marzo" }
    else if (month == 4) { month = "aprile" }
    else if (month == 5) { month = "maggio" }
    else if (month == 6) { month = "giugno" }
    else if (month == 7) { month = "luglio" }
    else if (month == 8) { month = "agosto" }
    else if (month == 9) { month = "settembre" }
    else if (month == 10) { month = "ottobre" }
    else if (month == 11) { month = "novembre" }
    else { month = "dicembre" }

    if (date == 1 | date == 8 | date == 11) {
        return currentDate = "l’" + date + " " + month + " " + year
    } else {
        return currentDate = "il " + date + " " + month + " " + year
    }

}

// funzione per il ritaglio video
function cutVids(fileJson, dir_name) {
    var start = 0
    var duration = 0
    let array = []
    for (var i = 0; i < fileJson["segments"].length; i++) {
        array.push(
            new Promise((resolve, reject) => {
                start = fileJson["segments"][i]["resizedTimeStart"] / 100
                duration = fileJson["segments"][i]["duration"] / 100
                FFmpeg({ source: '/data/segments/' + fileJson["segments"][i]["videoId"] + '_' + fileJson["segments"][i]["segmentId"] + '.mp4' })
                    .setStartTime(start)
                    .setDuration(duration)
                    .saveToFile(dir_name + "/" + fileJson["segments"][i]["videoId"] + '_' + fileJson["segments"][i]["segmentId"] + '_cut.mp4').on('end', resolve).on('error', reject)
            })
        )
    }

    return array
}

// funzione che crea il video di titolo
function makeTitle(testoTitolo, lunghBase, videoTitolo) {
    return new Promise((resolve, reject) => {
        FFmpeg({ source: 'files_export/intro.mp4' })
            .addInput('files_export/audio.mp3')
            .withVideoFilter("drawtext=text='" + testoTitolo + "': fontsize=23: fontcolor=white: box=1: boxcolor=black@0.25: boxborderw=5: x=(w-text_w)/2:y=(h-text_h)/2: enable='between(t,0," + (lunghBase + 2) + ")'")
            .saveToFile(videoTitolo).on('end', resolve).on('error', reject)
    })
}
// funzione che crea il video di crediti
function makeCredits(testoCrediti, lunghCred, videoCrediti) {
    return new Promise((resolve, reject) => {
        FFmpeg({ source: 'files_export/sfondo_crediti.mp4' })
            .addInput('files_export/audio.mp3')
            .setDuration(lunghCred + 2)
            .withVideoFilter("drawtext=text='" + testoCrediti + "': fontsize=20: fontcolor=white: box=1: boxcolor=black@0.25: boxborderw=5: x=(w-text_w)/2:y=h-100*t: enable='between(t,0," + (lunghCred + 2) + ")'")
            .saveToFile(videoCrediti).on('end', resolve).on('error', reject)
    })
}
// funzione che trasforma videoPerAudio da mp4 in mp3
function makeAudio(videoPerAudio, audio) {
    return new Promise((resolve, reject) => {
        FFmpeg({ source: videoPerAudio })
            .withNoVideo()
            .saveToFile(audio).on('end', resolve).on('error', reject)
    })
}

module.exports = { videoEsportazione }
