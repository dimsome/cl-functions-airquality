const fs = require("fs");
const dotenv = require("dotenv");
dotenv.config();
const path = require("path");
const {
  SubscriptionManager,
  SecretsManager,
  simulateScript,
  ResponseListener,
  ReturnType,
  decodeResult,
  createGist,
  deleteGist,
  FulfillmentCode,
} = require("@chainlink/functions-toolkit");
const functionsConsumerAbi = require("../../abi/functionsClient.json");
const ethers = require("ethers");
require("@chainlink/env-enc").config();

const consumerAddress = process.env.CONSUMER_MUMBAI; // REPLACE this with your Functions consumer address
const subscriptionId = process.env.SUB_ID; // REPLACE this with your subscription ID

const makeRequestMumbai = async () => {
  // hardcoded for Polygon Mumbai
  const routerAddress = "0x6E2dc0F9DB014aE19888F539E59285D2Ea04244C";
  const linkTokenAddress = "0x326C977E6efc84E512bB9C30f76E30c160eD06FB";
  const donId = "fun-polygon-mumbai-1";
  const explorerUrl = "https://mumbai.polygonscan.com";

  // Initialize functions settings
  const source = fs
    .readFileSync(path.resolve(__dirname, "source.js"))
    .toString();

  const args = ["35.98", "140.33"];
  const secrets = { apiKey: process.env.IQ_AIR_API_KEY };
  const gasLimit = 300000;

  // Initialize ethers signer and provider to interact with the contracts onchain
  const privateKey = process.env.PRIVATE_KEY; // fetch PRIVATE_KEY
  if (!privateKey)
    throw new Error(
      "private key not provided - check your environment variables"
    );

  const rpcUrl = process.env.POLYGON_MUMBAI_RPC_URL; // fetch mumbai RPC URL

  if (!rpcUrl)
    throw new Error(`rpcUrl not provided  - check your environment variables`);

  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);

  const wallet = new ethers.Wallet(privateKey);
  const signer = wallet.connect(provider); // create ethers signer for signing transactions

  ///////// START SIMULATION ////////////

  console.log("Start simulation...");

  const response = await simulateScript({
    source: source,
    args: args,
    bytesArgs: [], // bytesArgs - arguments can be encoded off-chain to bytes.
    secrets: secrets,
  });

  console.log("Simulation result", response);
  const errorString = response.errorString;
  if (errorString) {
    console.log(`❌ Error during simulation: `, errorString);
  } else {
    const returnType = ReturnType.string;
    const responseBytesHexstring = response.responseBytesHexstring;
    if (ethers.utils.arrayify(responseBytesHexstring).length > 0) {
      const decodedResponse = decodeResult(
        response.responseBytesHexstring,
        returnType
      );
      console.log(`✅ Decoded response to ${returnType}: `, decodedResponse);
    }
  }

  //////// ESTIMATE REQUEST COSTS ////////
  console.log("\nEstimate request costs...");
  // Initialize and return SubscriptionManager
  const subscriptionManager = new SubscriptionManager({
    signer: signer,
    linkTokenAddress: linkTokenAddress,
    functionsRouterAddress: routerAddress,
  });
  await subscriptionManager.initialize();

  // estimate costs in Juels

  const gasPriceWei = await signer.getGasPrice(); // get gasPrice in wei

  const estimatedCostInJuels =
    await subscriptionManager.estimateFunctionsRequestCost({
      donId: donId, // ID of the DON to which the Functions request will be sent
      subscriptionId: subscriptionId, // Subscription ID
      callbackGasLimit: gasLimit, // Total gas used by the consumer contract's callback
      gasPriceWei: BigInt(gasPriceWei), // Gas price in gWei
    });

  console.log(
    `Fulfillment cost estimated to ${ethers.utils.formatEther(
      estimatedCostInJuels
    )} LINK`
  );

  //////// MAKE REQUEST ////////

  console.log("\nMake request...");

  // First encrypt secrets and create a gist
  const secretsManager = new SecretsManager({
    signer: signer,
    functionsRouterAddress: routerAddress,
    donId: donId,
  });
  await secretsManager.initialize();

  // Encrypt secrets
  const encryptedSecretsObj = await secretsManager.encryptSecrets(secrets);

  console.log(`Creating gist...`);
  const githubApiToken = process.env.GITHUB_API_TOKEN;
  if (!githubApiToken)
    throw new Error(
      "githubApiToken not provided - check your environment variables"
    );

  // Create a new GitHub Gist to store the encrypted secrets
  const gistURL = await createGist(
    githubApiToken,
    JSON.stringify(encryptedSecretsObj)
  );
  console.log(`\n✅Gist created ${gistURL} . Encrypt the URLs..`);
  const encryptedSecretsUrls = await secretsManager.encryptSecretsUrls([
    gistURL,
  ]);

  const functionsConsumer = new ethers.Contract(
    consumerAddress,
    functionsConsumerAbi,
    signer
  );

  // To simulate the call and get the requestId.
  const requestId = await functionsConsumer.callStatic.sendRequest(
    source, // source
    encryptedSecretsUrls, // Encrypted Urls where the DON can fetch the encrypted secrets
    0, // don hosted secrets - slot ID - empty in this example
    0, // don hosted secrets - version - empty in this example
    args,
    [], // bytesArgs - arguments can be encoded off-chain to bytes.
    subscriptionId,
    gasLimit,
    ethers.utils.formatBytes32String(donId) // jobId is bytes32 representation of donId
  );

  // Actual transaction call
  const transaction = await functionsConsumer.sendRequest(
    source, // source
    encryptedSecretsUrls, // Encrypted Urls where the DON can fetch the encrypted secrets
    0, // don hosted secrets - slot ID - empty in this example
    0, // don hosted secrets - version - empty in this example
    args,
    [], // bytesArgs - arguments can be encoded off-chain to bytes.
    subscriptionId,
    gasLimit,
    ethers.utils.formatBytes32String(donId) // jobId is bytes32 representation of donId
  );

  // Log transaction details
  console.log(
    `\n✅ Functions request sent! Transaction hash ${transaction.hash} -  Request id is ${requestId}. Waiting for a response...`
  );

  console.log(
    `See your request in the explorer ${explorerUrl}/tx/${transaction.hash}`
  );

  const responseListener = new ResponseListener({
    provider: provider,
    functionsRouterAddress: routerAddress,
  }); // Instantiate a ResponseListener object to wait for fulfillment.
  (async () => {
    try {
      const response = await new Promise((resolve, reject) => {
        responseListener
          .listenForResponse(requestId)
          .then((response) => {
            resolve(response); // Resolves once the request has been fulfilled.
          })
          .catch((error) => {
            reject(error); // Indicate that an error occurred while waiting for fulfillment.
          });
      });

      const fulfillmentCode = response.fulfillmentCode;

      if (fulfillmentCode === FulfillmentCode.FULFILLED) {
        console.log(
          `\n✅ Request ${requestId} successfully fulfilled. Cost is ${ethers.utils.formatEther(
            response.totalCostInJuels
          )} LINK.Complete reponse: `,
          response
        );
      } else if (fulfillmentCode === FulfillmentCode.USER_CALLBACK_ERROR) {
        console.log(
          `\n⚠️ Request ${requestId} fulfilled. However, the consumer contract callback failed. Cost is ${ethers.utils.formatEther(
            response.totalCostInJuels
          )} LINK.Complete reponse: `,
          response
        );
      } else {
        console.log(
          `\n❌ Request ${requestId} not fulfilled. Code: ${fulfillmentCode}. Cost is ${ethers.utils.formatEther(
            response.totalCostInJuels
          )} LINK.Complete reponse: `,
          response
        );
      }

      const errorString = response.errorString;
      if (errorString) {
        console.log(`\n❌ Error during the execution: `, errorString);
        throw new Error(errorString);
      } else {
        const responseBytesHexstring = response.responseBytesHexstring;
        if (ethers.utils.arrayify(responseBytesHexstring).length > 0) {
          const decodedResponse = decodeResult(
            response.responseBytesHexstring,
            ReturnType.string
          );
          console.log(
            `\n✅ Decoded response to ${ReturnType.string}: `,
            decodedResponse
          );
          // Delete gistURL - not needed anymore
          console.log(`Delete gistUrl ${gistURL}`);
          await deleteGist(githubApiToken, gistURL);
          console.log(`\n✅ Gist ${gistURL} deleted`);
        }
      }
    } catch (error) {
      console.error("Error listening for response:", error);
    }
  })();
};

makeRequestMumbai().catch((e) => {
  console.error(e);
  process.exit(1);
});
