const fs = require("fs");
const path = require("path");
const axios = require("axios");

require("dotenv").config();

const headersList = {
  Accept: "application/vnd.github.cloak-preview",
};

const separator = "\t";
const github = process.env.GH_URL;
const members = process.env.MEMBERS.split(",");
const repos = process.env.REPOS.split(",");
const startDate = process.env.START;
const endDate = process.env.END;
const outDir = path.join(__dirname, "out");

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir);
}

const handleError = (error) => console.log(error);

const doRequest = async (member, repo) => {
  const csvRows = [];

  const { data: commitsData } = await axios
    .request({
      url:
        `${github}/search/commits?q=author-email:${member}+repo:${repo}` +
        `+committer-date:${startDate}..${endDate}+merge:false`,
      method: "GET",
      headers: headersList,
      auth: {
        username: process.env.GH_USER,
        password: process.env.GH_TOKEN,
      },
    })
    .catch(handleError);

  csvRows.push(
    [
      `${member}`,
      `${repo}`,
      `${commitsData.total_count}`,
      `start ${startDate}`,
      `end$ {endDate}`,
      `total`,
      `additions`,
      `deletions`,
    ].join(separator)
  );

  for (const item of commitsData.items) {
    const { data: itemData } = await axios
      .request({
        url: item.url,
        method: "GET",
        headers: headersList,
        auth: {
          username: process.env.GH_USER,
          password: process.env.GH_TOKEN,
        },
      })
      .catch(handleError);

    csvRows.push(
      [
        `${item.commit.message.split("\n")[0]}`,
        `${item.html_url}`,
        `${itemData.stats.total}`,
        `${itemData.stats.additions}`,
        `${itemData.stats.deletions}`,
      ].join(separator)
    );

    console.log(".");
  }

  const resultString = csvRows.join("\n");

  return { resultString, totalCount: commitsData.total_count };
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
  sumsResultStrings.push(`TOTAL${separator}${totalCount}`);

  totalPerRepo.forEach((value, key) => {
    sumsResultStrings.push(`${key}${separator}${value}`);
  });

  fs.writeFileSync(
    path.join(__dirname, "out", "summary.csv"),
    sumsResultStrings.join(`\n${"-".repeat(80)}\n`)
  );
};

main();
