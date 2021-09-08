const fs = require("fs");
const axios = require("axios");

require("dotenv").config();

const headersList = {
  Accept: "application/vnd.github.cloak-preview",
  "User-Agent": "Thunder Client (https://www.thunderclient.io)",
};

const members = process.env.USERS.split(",");
console.log(members);

const repos = process.env.REPOS.split(",");
console.log(repos);

const startDate = process.env.START;
console.log(startDate);

const endDate = process.env.END;
console.log(endDate);

const doRequest = async (member, repo) => {
  const reqOptionsCommits = {
    url:
      `https://api.github.com/search/commits?q=author:${member}+repo:${repo}` +
      `+author-date:${startDate}..${endDate}+merge:false`,
    method: "GET",
    headers: headersList,
    auth: {
      username: process.env.GH_USER,
      password: process.env.GH_TOKEN,
    },
  };

  const csvRows = [];

  const response = await axios
    .request(reqOptionsCommits)
    .catch((error) => console.log(error));

  csvRows.push(
    `${member},${repo},${response.data.total_count},start ${startDate}, end ${endDate}`
  );

  response.data.items.forEach((item) => {
    csvRows.push(`${item.commit.message.split("\n")[0]},${item.html_url}`);
  });

  const resultString = csvRows.join("\n");

  return resultString;
};

const main = async () => {
  for (let member of members) {
    const resultStrings = [];

    for (let repo of repos) {
      const resultString = await doRequest(member, repo);

      resultStrings.push(resultString);
    }

    fs.writeFileSync(
      `./out/${member}.csv`,
      resultStrings.join(`\n${"-".repeat(80)}\n`)
    );

    console.log(`${member} saved`);
  }
};

main();
