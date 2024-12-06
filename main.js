async function classifyImage(pathToImage){ 
    var imageTensor = await getImageTensorFromPath(pathToImage); // Convert image to a tensor
    var predictions = await runModel(imageTensor); // Run inference on the tensor
    console.log(predictions); // Print predictions to console
    document.getElementById("outputText").innerHTML += predictions[0].name; // Display prediction in HTML
  }
  async function getImageTensorFromPath(path, width = 224, height = 224) {
    var image = await loadImagefromPath(path, width, height); // 1. load the image
    var imageTensor = imageDataToTensor(image); // 2. convert to tensor
    return imageTensor; // 3. return the tensor
  } 

  async function loadImagefromPath(path, resizedWidth, resizedHeight) {
    var imageData = await Jimp.read(path).then(imageBuffer => { // Use Jimp to load the image and resize it.
      return imageBuffer.resize(resizedWidth, resizedHeight);
    });

    return imageData.bitmap;
  }
  function imageDataToTensor(image) {
    var imageBufferData = image.data;
    let pixelCount = image.width * image.height;
    const float32Data = new Float32Array(3 * pixelCount); // Allocate enough space for red/green/blue channels.

    // Loop through the image buffer, extracting the (R, G, B) channels, rearranging from
    // packed channels to planar channels, and converting to floating point.
    for (let i = 0; i < pixelCount; i++) {
      float32Data[pixelCount * 0 + i] = imageBufferData[i * 4 + 0] / 255.0; // Red
      float32Data[pixelCount * 1 + i] = imageBufferData[i * 4 + 1] / 255.0; // Green
      float32Data[pixelCount * 2 + i] = imageBufferData[i * 4 + 2] / 255.0; // Blue
      // Skip the unused alpha channel: imageBufferData[i * 4 + 3].
    }
    let dimensions = [1, 3, image.height, image.width];
    const inputTensor = new ort.Tensor("float32", float32Data, dimensions);
    return inputTensor;
  }
  async function runModel(preprocessedData) { 
    // Set up environment.
    ort.env.wasm.numThreads = 1; 
    ort.env.wasm.simd = true; 
    // Uncomment for additional information in debug builds:
    // ort.env.wasm.proxy = true; 
    // ort.env.logLevel = "verbose";  
    // ort.env.debug = true; 

    // Configure WebNN.
    const modelPath = "./mobilenetv2-10.onnx";
    const devicePreference = "gpu"; // Other options include "npu" and "cpu".
    const options = {
	    executionProviders: [{ name: "webnn", deviceType: devicePreference, powerPreference: "default" }],
      freeDimensionOverrides: {"batch": 1, "channels": 3, "height": 224, "width": 224}
      // The key names in freeDimensionOverrides should map to the real input dim names in the model.
      // For example, if a model's only key is batch_size, you only need to set
      // freeDimensionOverrides: {"batch_size": 1}
    };
    modelSession = await ort.InferenceSession.create(modelPath, options); 

    // Create feeds with the input name from model export and the preprocessed data. 
    const feeds = {}; 
    feeds[modelSession.inputNames[0]] = preprocessedData; 
    // Run the session inference.
    const outputData = await modelSession.run(feeds); 
    // Get output results with the output name from the model export. 
    const output = outputData[modelSession.outputNames[0]]; 
    // Get the softmax of the output data. The softmax transforms values to be between 0 and 1.
    var outputSoftmax = softmax(Array.prototype.slice.call(output.data)); 
    // Get the top 5 results.
    var results = imagenetClassesTopK(outputSoftmax, 5);

    return results; 
  }
  // The softmax transforms values to be between 0 and 1.
function softmax(resultArray) {
    // Get the largest value in the array.
    const largestNumber = Math.max(...resultArray);
    // Apply the exponential function to each result item subtracted by the largest number, using reduction to get the
    // previous result number and the current number to sum all the exponentials results.
    const sumOfExp = resultArray 
      .map(resultItem => Math.exp(resultItem - largestNumber)) 
      .reduce((prevNumber, currentNumber) => prevNumber + currentNumber);
  
    // Normalize the resultArray by dividing by the sum of all exponentials.
    // This normalization ensures that the sum of the components of the output vector is 1.
    return resultArray.map((resultValue, index) => {
      return Math.exp(resultValue - largestNumber) / sumOfExp
    });
  }
  
  function imagenetClassesTopK(classProbabilities, k = 5) { 
    const probs = _.isTypedArray(classProbabilities)
      ? Array.prototype.slice.call(classProbabilities)
      : classProbabilities;
  
    const sorted = _.reverse(
      _.sortBy(
        probs.map((prob, index) => [prob, index]),
        probIndex => probIndex[0]
      )
    );
  
    const topK = _.take(sorted, k).map(probIndex => {
      const iClass = imagenetClasses[probIndex[1]]
      return {
        id: iClass[0],
        index: parseInt(probIndex[1].toString(), 10),
        name: iClass[1].replace(/_/g, " "),
        probability: probIndex[0]
      }
    });
    return topK;
  }