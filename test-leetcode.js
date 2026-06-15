// const fetchLeetCodeCalendar = async (username) => {
//   try {
//     const response = await fetch('https://leetcode.com/graphql', {
//       method: 'POST',
//       headers: {
//         'Content-Type': 'application/json',
//         'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
//       },
//       body: JSON.stringify({
//         query: `
//           query userSubmissionCalendar($username: String!) {
//             matchedUser(username: $username) {
//               submissionCalendar
//             }
//           }
//         `,
//         variables: { username }
//       })
//     });

//     const data = await response.json();
//     console.log(JSON.stringify(data, null, 2));
//     if (data.data && data.data.matchedUser && data.data.matchedUser.submissionCalendar) {
//       const calendar = JSON.parse(data.data.matchedUser.submissionCalendar);
//       console.log('Sample calendar entries:', Object.entries(calendar).slice(-10));
//     }
//   } catch (error) {
//     console.error('Error fetching calendar:', error);
//   }
// };

// fetchLeetCodeCalendar('Chiragvarshney_official24');


async function fetchLeetCodeCalendar(username) {
  const query = `
    query userSubmissionCalendar($username: String!) {
      matchedUser(username: $username) {
        username
        submissionCalendar
      }
    }
  `;

  try {
    const response = await fetch("https://leetcode.com/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Referer": `https://leetcode.com/${username}/`,
      },
      body: JSON.stringify({
        query,
        variables: { username },
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Request failed: ${response.status} ${response.statusText}`
      );
    }

    const result = await response.json();

    const user = result?.data?.matchedUser;

    if (!user) {
      throw new Error(`User "${username}" not found`);
    }

    const calendar = JSON.parse(user.submissionCalendar || "{}");

    const submissions = Object.entries(calendar)
      .map(([timestamp, count]) => ({
        date: new Date(Number(timestamp) * 1000)
          .toISOString()
          .split("T")[0],
        submissions: Number(count),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return submissions;
  } catch (error) {
    console.error("Error:", error.message);
    return [];
  }
}

// Example
(async () => {
  const data = await fetchLeetCodeCalendar(
    "Chiragvarshney_official24"
  );

  console.log("Last 10 entries:");
  console.table(data.slice(-10));
})();