const fs = require("fs");
const path = require("path");
const axios = require("axios");
const exec = require("child_process").exec;

process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;

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
const gerritRepos = process.env.GERRIT_REPOS.split(",");
const gerritPort = process.env.GERRIT_PORT;
const gerritUrl = process.env.GERRIT_URL;

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir);
}

const handleError = (error) => console.log(error);

const executeCommand = async (command) => {
  return new Promise((resolve) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.log("-".repeat(80));
        console.log("\nERROR");
        console.log("-".repeat(80));
        console.log(error.message);
        console.log("-".repeat(80) + "\n");
      }

      if (stderr) {
        console.log("-".repeat(80));
        console.log("\nERR");
        console.log("-".repeat(80));
        console.log(stderr);
        console.log("-".repeat(80) + "\n");
      }

      // console.log("-".repeat(80));
      // console.log("\nOUT");
      // console.log("-".repeat(80));
      // console.log(stdout);
      // console.log("-".repeat(80) + "\n");

      resolve(
        error?.code
          ? []
          : stdout
              .split("\n")
              .filter((line) => {
                return line.trim() !== "";
              })
              .map((line) => {
                return JSON.parse(line);
              })
      );
    });
  });
};

const doGerritReviewsRequest = async (member, project) => {
  const csvRows = [];

  const command = `ssh -p ${gerritPort} ${gerritUrl} gerrit query --format=JSON project:${project} branch:master status:merged label:Code-Review=2,user=${member} after:${startDate} before:${endDate}`;

  console.log(command);

  const res = await executeCommand(command);

  // console.log(res);

  // header
  csvRows.push(
    [
      `${member}`,
      `${project}`,
      `status`,
      `owner`
    ].join(separator)
  );

  res.forEach(item => {
    if (item.type) {
      return;
    }

    csvRows.push(
      [
        `${item.subject}`,
        `${item.url}`,
        `${item.status}`,
        `${item.owner.email}`
      ].join(separator)
    ); 
  })

  return csvRows;
};

const doRequest = async (member, repo) => {
  const csvRows = [];

  const { data: commitsData } = await axios
    .request({
      url:
        `${github}/search/commits?q=author-email:${member}+repo:${repo}` +
        `+committer-date:${startDate}..${endDate}+merge:false&per_page=100`,
      method: "GET",
      headers: headersList,
      auth: {
        username: process.env.GH_USER,
        password: process.env.GH_TOKEN,
      },
    })
    .catch(handleError);

  let itemsOmmitted = false;
  if (commitsData.total_count > commitsData.items.length) {
    itemsOmmitted = true;
    console.warn(
      "Total count larger than retrieved items. Some changes are ommitted due to GH API quota"
    );
  }

  // header
  csvRows.push(
    [
      `${member}`,
      `${repo}`,
      `${commitsData.total_count}${
        itemsOmmitted ? " (ommitted items below; see log)" : " (no ommitted)"
      }`,
      `start ${startDate}`,
      `end ${endDate}`,
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
        `-`,
        `-`,
        `-`,
        `${itemData.stats.total}`,
        `${itemData.stats.additions}`,
        `${itemData.stats.deletions}`,
      ].join(separator)
    );

    // console.log(".");
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
      path.join(__dirname, "out", `changes-${member}.csv`),
      resultStrings.join(`\n${"-".repeat(80)}\n`)
    );

    console.log(`${member} changes saved`);

    let reviewsResults = [];

    for (let gerritRepo of gerritRepos) {
      const res = await doGerritReviewsRequest(member, gerritRepo);

      // console.log(res);
      reviewsResults = reviewsResults.concat(res);
    }

    fs.writeFileSync(
      path.join(__dirname, "out", `reviews-${member}.csv`),
      // reviewsResults.join(`\n${"-".repeat(80)}\n`)
      reviewsResults.join(`\n`)
    );
  }

  const sumsResultStrings = [];
  sumsResultStrings.push(`TOTAL${separator}${totalCount}`);

  totalPerRepo.forEach((value, key) => {
    sumsResultStrings.push(`${key}${separator}${value}`);
  });

  fs.writeFileSync(
    path.join(__dirname, "out", "changes-summary.csv"),
    sumsResultStrings.join(`\n${"-".repeat(80)}\n\t-`)
  );
};

main();
