require("dotenv").config();
const { customAlphabet } = require("nanoid");
const fs = require("fs");
const path = require("path");

const debug = require("debug")("auth0-load-test:whitelist");

function generateRelayStates(patterns) {
  const paramName = customAlphabet("abcdefghijklmnopqrstuvwxyz", 4);
  const urlPart = customAlphabet("abcdefghijklmnopqrstuvwxyz", 10);

  const generatePaths = pattern => [
    `${pattern}/${urlPart()}`,
    `${pattern}/${urlPart()}/${urlPart()}`,
    `${pattern}/${urlPart()}/${urlPart()}/${urlPart()}`,
    `${pattern}/${urlPart()}/${urlPart()}/${urlPart()}/${urlPart()}`,
    `${pattern}/${urlPart()}/${urlPart()}/${urlPart()}/${urlPart()}/${urlPart()}`
  ];

  const generateQuery = pattern => [
    `${pattern}?${paramName()}=${urlPart()}`,
    `${pattern}?${paramName()}=${urlPart()}&${paramName()}=${urlPart()}`,
    `${pattern}?${paramName()}=${urlPart()}&${paramName()}=${urlPart()}&${paramName()}=${urlPart()}`,
    `${pattern}?${paramName()}=${urlPart()}&${paramName()}=${urlPart()}&${paramName()}=${urlPart()}&${paramName()}=${urlPart()}`,
    `${pattern}?${paramName()}=${urlPart()}&${paramName()}=${urlPart()}&${paramName()}=${urlPart()}&${paramName()}=${urlPart()}&${paramName()}=${urlPart()}`
  ];

  return patterns
    .map(pattern => {
      if (pattern.endsWith("/*"))
        return generatePaths(pattern.replace("/*", ""));
      if (pattern.endsWith("?*"))
        return generateQuery(pattern.replace("?*", ""));
      return pattern;
    })
    .reduce((acc, val) => acc.concat(val), []);
}

function generateClients(requiredClients) {
  debug("Generating %d clients", requiredClients);
  const urlPart = customAlphabet("abcdefghijklmnopqrstuvwxyz1234567890", 14);
  const shortId = customAlphabet("abcdefghijklmnopqrstuvwxyz", 4);
  const clients = [];
  for (let index = 0; index < requiredClients; index++) {
    const tld = urlPart();
    const patterns = [
      `https://${tld}.int.thomsonreuters.com`,
      `https://${tld}.int.thomsonreuters.com/*`,
      `https://${tld}.int.thomsonreuters.com?*`
    ];
    const client = {
      clientName: `loadclient-${shortId()}`,
      loginUrl: `https://${tld}.int.thomsonreuters.com/login`,
      patterns: patterns,
      relayStates: generateRelayStates(patterns)
    };
    // don't use loginUrl for 20% client
    if (index % 5 === 0) delete client.loginUrl;

    clients.push(client);
  }
  debug("Returning %d generated clients", clients.length);
  return clients;
}

function generateDataFiles(generatedClients) {
  const whilelistFile = path.join(__dirname, "./whitelist.json");
  const relayStatesFile = path.join(
    __dirname,
    "../__processors__/data/relayStates.json"
  );
  debug("Writing data files");

  // const relayStates = generatedClients
  //   .map((client) => client.relayStates)
  //   .reduce((acc, val) => acc.concat(val), []);

  try {
    fs.writeFileSync(relayStatesFile, JSON.stringify(generatedClients), "utf8");
    generatedClients.forEach(client => delete client.relayStates);
    fs.writeFileSync(whilelistFile, JSON.stringify(generatedClients), "utf8");
  } catch (error) {
    debug("Error writing file %o", error);
  }
}

// Root level async
(async () => {
  const generatedClients = generateClients(process.env.MAX_CLIENTS);
  await generateDataFiles(generatedClients);
})();
