const fs = require("fs");
const path = require("path");
const axios = require("axios");

require("dotenv").config();

const headersList = {
  Accept: "application/vnd.github.cloak-preview",
};

const delimiter = ";;";
const github = process.env.GH_URL;
const members = process.env.USERS.split(",");
const repos = process.env.REPOS.split(",");
const startDate = process.env.START;
const endDate = process.env.END;
const outDir = path.join(__dirname, "out");

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir);
}

const doRequest = async (member, repo) => {
  const reqOptionsCommits = {
    url:
      `${github}/search/commits?q=author:${member}+repo:${repo}` +
      `+committer-date:${startDate}..${endDate}+merge:false`,
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
    [
      `${member}`,
      `${repo}`,
      `${response.data.total_count}`,
      `start ${startDate}`,
      `end$ {endDate}`,
    ].join(delimiter)
  );

  response.data.items.forEach((item) => {
    csvRows.push(
      [`${item.commit.message.split("\n")[0]}`, `${item.html_url}`].join(
        delimiter
      )
    );
  });

  const resultString = csvRows.join("\n");

  return { resultString, totalCount: response.data.total_count };
};

const main = async () => {
  let totalCount = 0;
  const totalPerRepo = new Map();

  for (let member of members) {
    const resultStrings = [];

    for (let repo of repos) {
      if (!totalPerRepo.has(repo)) {
        totalPerRepo.set(repo, 0);
      }

      const res = await doRequest(member, repo);

      resultStrings.push(res.resultString);
      totalCount += res.totalCount;
      totalPerRepo.set(repo, totalPerRepo.get(repo) + res.totalCount);
    }

    fs.writeFileSync(
      path.join(__dirname, "out", `${member}.csv`),
      resultStrings.join(`\n${"-".repeat(80)}\n`)
    );

    console.log(`${member} saved`);
  }

  const sumsResultStrings = [];
  sumsResultStrings.push(`TOTAL${delimiter}${totalCount}`);

  totalPerRepo.forEach((value, key) => {
    sumsResultStrings.push(`${key}${delimiter}${value}`);
  });

  fs.writeFileSync(
    path.join(__dirname, "out", "summary.csv"),
    sumsResultStrings.join(`\n${"-".repeat(80)}\n`)
  );
};

main();
