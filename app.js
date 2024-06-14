import express from 'express';
import { request } from '@octokit/request';
import 'dotenv/config';
import { JSDOM } from "jsdom";

const app = express();

app.set('view engine', 'ejs');
app.set('views', './views');
app.use(express.static('public'));

async function fetchDiscussions(query, variables) {
    const response = await request('POST /graphql', {
        headers: {
            authorization: `bearer ${process.env.GITHUB_TOKEN}`,
        },
        query,
        variables,
    });
    return response.data.data.repository.discussions.nodes;
}

function generateRandomAlphabetString(length) {
    const alphabet = 'abcdefghijklmnopqrstuvwxyz';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
    }
    return result;
}

async function getDiscussions(after) {
    const first = 100;
    const query = `
    query($first: Int, $after: String) {
      repository(owner: "Temporary-org-project", name: "temp-project") {
        discussions(first: $first, after: $after) {
          pageInfo {
            endCursor
            hasNextPage
          }
          nodes {
            id
            title
            createdAt
            category {
              name
            }
            labels(first: 10) {
              nodes {
                name
                color
              }
            }
          }
        }
      }
    }
  `;
    const variables = { first, after };
    return fetchDiscussions(query, variables);
}

function processDiscussionHTML(bodyHTML) {
    const dom = new JSDOM(bodyHTML);
    const doc = dom.window.document;
    const idArray = [];
    doc.querySelectorAll('h2').forEach(e => {
        const randomString = generateRandomAlphabetString(8);
        e.id = randomString;
        idArray.push([randomString, e.textContent]);
    });

    doc.querySelectorAll('math-renderer').forEach(e => {
        let t = e.textContent.trim();
        if (!t.startsWith("$$") && t.startsWith("$")) e.textContent = t.replace(/^\$/, "\\(").replace(/\$$/, "\\)");
    });
    return { doc, idArray };
}

app.get('/', async (req, res) => {
    try {
        const discussions = await getDiscussions(req.query.after);
        let invalidRoute = false;
        res.render('home', { discussions, invalidRoute });
    } catch (error) {
        console.error(error);
        res.status(500).render('error', { message: 'Error fetching discussions' });
    }
});

app.get('/p/:id', async (req, res) => {
    const discussions = await getDiscussions(req.query.after);
    const id = req.params.id;
    try {
        const response = await fetch('https://api.github.com/graphql', {
            method: 'POST',
            headers: {
                authorization: `bearer ${process.env.GITHUB_TOKEN}`,
            },
            body: JSON.stringify({
                query: `
          query GetDiscussion($id: ID!) {
            node(id: $id) {
              ... on Discussion {
                id
                title
                bodyHTML
                url
                updatedAt
                author {
                  login
                  url
                  avatarUrl
                }
                category {
                  name
                }
              }
            }
          }
        `,
                variables: { id },
            }),
        });
        const responseData = await response.json();
        if (responseData.errors) {
            let invalidRoute = true;
            res.render('home', { discussions, invalidRoute });
            return
        }
        const discussion = responseData.data.node;
        // if (!discussion) {
        //     let invalidRoute = true;
        //     res.render('home', { discussions, invalidRoute});
        // }
        const { doc, idArray } = processDiscussionHTML(discussion.bodyHTML);
        res.render('discussion', { doc, discussion, idArray });
    } catch (error) {
        console.error('Error:', error);
        let invalidRoute = true;
        res.render('home', { discussions, invalidRoute });
        return
    }
});

app.get('*', async (req, res) => {
    const discussions = await getDiscussions(req.query.after);
    // Use a generic error handler function for a cleaner approach
    // handleError(res, 404, 'Page not found');
    try {
        const discussions = await getDiscussions(req.query.after);
        let invalidRoute = true;
        res.render('home', { discussions, invalidRoute });
    } catch (error) {
        console.error(error);
        res.status(500).render('error', { message: 'Error fetching discussions' });
    }
});

function handleError(res, statusCode, message) {
    res.status(statusCode).render('error', { message });
}

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server is running on port http://localhost:${port}`);
});
