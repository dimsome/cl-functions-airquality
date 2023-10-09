const lat = args[0];
const lon = args[1];

// make HTTP request
const url = `http://api.airvisual.com/v2/nearest_city`;
console.log(
  `HTTP GET Request to ${url}?lat=${lat}&lon=${lon}&key=${secrets.apiKey}`
);

const airRequest = Functions.makeHttpRequest({
  url: url,
  headers: {
    "Content-Type": "application/json",
  },
  params: {
    lat: lat,
    lon: lon,
    key: secrets.apiKey,
  },
});

// Execute the API request (Promise)
const response = await airRequest;
if (response.error) {
  console.error(response.error);
  throw Error("Request failed");
}

const data = response["data"];
if (data.Response === "Error") {
  console.error(data.Message);
  throw Error(`Functional error. Read message: ${data.Message}`);
}
// console.log(`Response: ${JSON.stringify(data)}`);

// extract the price
console.log(`The nearest city is ${data.data.city}`);

return Functions.encodeString(JSON.stringify(data.data.city));
