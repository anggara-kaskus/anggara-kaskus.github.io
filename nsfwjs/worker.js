importScripts(
	'https://unpkg.com/@tensorflow/tfjs@2.6.0',
	'https://unpkg.com/nsfwjs@2.3.0',
	'https://cdn.jsdelivr.net/npm/@lyo/jpeg-js',
	'https://cdnjs.cloudflare.com/ajax/libs/axios/0.21.1/axios.min.js'
);

let model;

onmessage = function(e) {
	switch (e.data.event) {
		case 'scanImage':
			postMessage({'event': 'log', 'message': 'scanImage: [' + e.data.id + '] ' + e.data.src});
			axios.get(e.data.src, {
				responseType: 'arraybuffer',
			}).then(pic => {
				classify(imageToTensor(pic.data), e.data.id);
			})
			break;

	}
}

let start = +(new Date);
postMessage({'event': 'log', 'message': 'Loading model...'});
nsfwjs.load().then((loadedModel) => {
	postMessage({'event': 'log', 'message': 'Model loaded in ' + (+(new Date) - start) + 'ms'});
	model = loadedModel;
	postMessage({'event': 'modelReady'});
});

function classify(img, id) {
	postMessage({'event': 'log', 'message': 'Classifying image: [' + id + ']'});
	const start = +(new Date);
		model.classify(img).then((predictions) => {
			let message = '\nPredictions for [' + id + ']:\n';

			let applyBlur = false;
			for (i = 0 ; i < predictions.length; i++) {
				message += (i ? '    ' : ' -> ') + predictions[i].className.padEnd(15, ' ');
				message += ': ' + round(predictions[i].probability) + '\n';

				if (
					(predictions[i].className == 'Hentai' || predictions[i].className == 'Porn') &&
					predictions[i].probability > 0.5
				) {
					applyBlur = true;
				}
			}
			message += 'Process time: ' + (+(new Date) - start) + 'ms';
			postMessage({'event': 'log', 'message': message});
			postMessage({'event': 'scanResult', 'id': id, 'result': applyBlur});
		});
}

function imageToTensor(rawImageData) {
    const TO_UINT8ARRAY = true;
    const { width, height, data } = jpegJs.decode(rawImageData, TO_UINT8ARRAY);
    const buffer = new Uint8Array(width * height * 3);
    let offset = 0;
    for (let i = 0; i < buffer.length; i += 3) {
      buffer[i] = data[offset];
      buffer[i + 1] = data[offset + 1];
      buffer[i + 2] = data[offset + 2];

      offset += 4;
    }

    return tf.tensor3d(buffer, [height, width, 3]);
  }

function round(num) {
	return Math.round(num * 100) / 100;
}
