import { task } from "hardhat/config";

// hardhat task to deploy FunctionConsumer contract
task("deploy", "Deploy FunctionConsumer contract")
  .addParam("contract", "The contract's name", "FunctionsConsumerExample")
  .setAction(async (taskArgs, hre) => {
    const addressRouter = "0x6E2dc0F9DB014aE19888F539E59285D2Ea04244C";
    const contract = taskArgs.contract;
    // Get signer
    const signers = await hre.ethers.getSigners();
    console.log(
      `Deploying ${contract} contract with the account:`,
      signers[0].address
    );
    const ContractFactory = await hre.ethers.getContractFactory(
      contract,
      signers[0]
    );

    const deployedContract = await ContractFactory.deploy(addressRouter);
    await deployedContract.waitForDeployment();
    console.log(
      "FunctionConsumer contract deployed to:",
      await deployedContract.getAddress()
    );
  });
