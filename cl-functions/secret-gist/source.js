// This example shows how to make a call to an open API (no authentication required)
// to retrieve asset price from a symbol(e.g., ETH) to another symbol (e.g., USD)

// CryptoCompare API https://min-api.cryptocompare.com/documentation?key=Price&cat=multipleSymbolsFullPriceEndpoint

// Refer to https://github.com/smartcontractkit/functions-hardhat-starter-kit#javascript-code

// Arguments can be provided when a request is initated on-chain and used in the request source code as shown below
const lat = args[0];
const lon = args[1];

// make HTTP request
const url = `http://api.airvisual.com/v2/nearest_city`;
console.log(
  `HTTP GET Request to ${url}?lat=${lat}&lon=${lon}&key=${secrets.apiKey}`
);

// construct the HTTP Request object. See: https://github.com/smartcontractkit/functions-hardhat-starter-kit#javascript-code
// params used for URL query parameters
// Example of query: https://min-api.cryptocompare.com/data/pricemultifull?fsyms=ETH&tsyms=USD
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
