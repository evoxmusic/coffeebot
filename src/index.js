const key = process.env.AUTH_KEY
const MAX_COFFEE_ADD = 5;
const MAX_COFFEE_SUBTRACT = 2;
const COUNT_DISPLAY_SIZE = 5;

require('dotenv').config()
const Koa = require('koa');
const Router = require('koa-router');
const bodyParser = require('koa-bodyparser');
const { DateTime } = require("luxon");
const { Pool } = require('pg');

const app = new Koa();
app.use(bodyParser());

const router = new Router();

const pool = new Pool({
    user: process.env.QOVERY_DATABASE_COFFEE_DB_USERNAME,
    host: process.env.QOVERY_DATABASE_COFFEE_DB_HOST,
    database: process.env.QOVERY_DATABASE_COFFEE_DB_DATABASE,
    password: process.env.QOVERY_DATABASE_COFFEE_DB_PASSWORD,
    port: process.env.QOVERY_DATABASE_COFFEE_DB_PORT,
});

function showHelp() {
    return {
        "response_type": "ephemeral",
        "text": `Ohai, and welcome to coffeebot. Coffeebot counts the coffees consumed by Common Coders because why not.

        The most important commands are:

        - \`/coffee help\` - You found this already
        - \`/coffee\` - add a single coffee
        - \`/coffee <number>\` - add multiple coffees, max 5; but try to use /coffee when you get a coffee instead
        - \`/coffee stomach-pump\` - subtract a single coffee
        - \`/coffee -<number>\` - subtract multiple coffees, max 2; but try not to add coffees you're not drinking
        - \`/coffee count\` - show the total number of coffees, and highest 5 coffee consumers
        - \`/coffee count-all\` - show the total number of coffees, and _all_ coffee consumers`
    }
}

// CREATE_DATABASE_QUERY = "CREATE DATABASE drinks ENCODING = 'UTF8'";
CHECK_IF_DATABASE_EXISTS_QUERY = "SELECT datname FROM pg_catalog.pg_database WHERE datname = drinks;"
CREATE_DRINK_TABLE_QUERY = `
CREATE TABLE IF NOT EXISTS public.coffee
(
    id bigserial NOT NULL,
    user_id character varying(50) NOT NULL,
    user_name character varying(200),
    created_at timestamp with time zone NOT NULL,
    PRIMARY KEY (id)
);
`
ADD_DRINK_QUERY = 'INSERT INTO coffee (user_id, user_name, created_at) VALUES($1, $2, $3)'
COUNT_ALL_DRINKS_QUERY = 'SELECT COUNT(*) FROM coffee WHERE created_at > $1 AND created_at < $2'
COUNT_USER_DRINKS_QUERY = 'SELECT COUNT(*) FROM coffee WHERE user_id = $1 AND created_at > $2 AND created_at < $3'
TALLY_ALL_DRINKS_QUERY = 'SELECT user_name, COUNT(*) AS drink_count FROM coffee WHERE created_at > $1 AND created_at < $2 GROUP BY user_name ORDER BY drink_count DESC'
DELETE_N_MOST_RECENT_DRINKS_FOR_USER_QUERY = 'DELETE FROM coffee WHERE id IN (SELECT id FROM coffee WHERE user_id = $1 AND created_at > $2 AND created_at < $3 ORDER BY id DESC LIMIT $4)'

async function createDatabaseBitsIfMissing() {
    const client = await pool.connect()
    try {
        client.query(CREATE_DRINK_TABLE_QUERY);
    } finally {
        client.release()
    }

}

async function showCoffeeCount(numOfItems) {

    const client = await pool.connect()
    try {

        var dt = DateTime.local().setZone("Australia/Melbourne");
        const start_of_today = dt.set({ hour: 0, minute: 0, second: 0, millisecond: 0 })
        const start_of_tomorrow = dt.plus({ days: 1 }).set({ hour: 0, minute: 0, second: 0, millisecond: 0 })

        const totalCoffeeCountQuery = await client.query(COUNT_ALL_DRINKS_QUERY, [start_of_today.toISO(), start_of_tomorrow.toISO()])
        const totalCoffeeCount = totalCoffeeCountQuery.rows[0].count

        const coffeeCountByUserQuery = await client.query(TALLY_ALL_DRINKS_QUERY, [start_of_today.toISO(), start_of_tomorrow.toISO()])

        let blocks = []
        let textChunks = []

        itemsToShow = numOfItems ? Math.min(numOfItems, coffeeCountByUserQuery.rows.length) : coffeeCountByUserQuery.rows.length;

        for (let idx = 0, len = itemsToShow; idx < len; idx++) {
            textChunks.push(`- _${coffeeCountByUserQuery.rows[idx].user_name}_ has consumed ${coffeeCountByUserQuery.rows[idx].drink_count} coffees`)
        }

        if (textChunks.length > 0) {
            blocks.push({
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": textChunks.join("\n")
                }
            })
        }


        blocks.unshift(
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": `*Today*, Common Coders have consumed ${totalCoffeeCount} coffees`
                }
            },
        )

        return {
            "response_type": "in_channel",
            "blocks": blocks
        };
    } finally {
        client.release()
    }
}

async function addCoffee(userId, userName, inc) {

    if (inc > MAX_COFFEE_ADD) {
        return {
            "response_type": "ephemeral",
            "text": "You can't add more than 5 coffees at a time"
        }
    }

    if (-1 * inc > MAX_COFFEE_SUBTRACT) {
        return {
            "response_type": "ephemeral",
            "text": "You can't remove more than 2 coffees at a time"
        }
    }

    const client = await pool.connect()
    try {

        const dt = DateTime.local().setZone("Australia/Melbourne");
        const start_of_today = dt.set({ hour: 0, minute: 0, second: 0, millisecond: 0 })
        const start_of_tomorrow = dt.plus({ days: 1 }).set({ hour: 0, minute: 0, second: 0, millisecond: 0 })

        if (inc > 0) {
            for (let idx = 0; idx < inc; idx++) {
                await client.query(ADD_DRINK_QUERY, [userId, userName, dt.toISO()])
            }
        } else if (inc < 0) {
            await client.query(DELETE_N_MOST_RECENT_DRINKS_FOR_USER_QUERY, [userId, start_of_today.toISO(), start_of_tomorrow.toISO(), -1 * inc])
        }

        const totalCoffeeCountQuery = await client.query(COUNT_ALL_DRINKS_QUERY, [start_of_today.toISO(), start_of_tomorrow.toISO()])
        const totalCoffeeCount = totalCoffeeCountQuery.rows[0].count
        const userCoffeeCountQuery = await client.query(COUNT_USER_DRINKS_QUERY, [userId, start_of_today.toISO(), start_of_tomorrow.toISO()])
        const userCoffeeCount = userCoffeeCountQuery.rows[0].count

        return {
            "response_type": "ephemeral",
            "text": `That's coffee number ${userCoffeeCount} for you today, and number ${totalCoffeeCount} for CC today`
        }
    } finally {
        client.release()
    }
}

router.post('/addCoffee', async (ctx, next) => {
    if (ctx.request.query.key !== key) {
        ctx.body = { result: "nope" };
        return
    }

    // I'd love to run this somewhere else... but where?
    await createDatabaseBitsIfMissing();

    if (ctx.request.body.command !== "/coffee") {
        ctx.body({ "response_type": "ephemeral", "text": "Something has gone horribly wrong" });
        return;
    }

    if (ctx.request.body.text === "help") {
        ctx.body = showHelp();
        return;
    } else if (ctx.request.body.text === "count") {
        ctx.body = await showCoffeeCount(COUNT_DISPLAY_SIZE);
        return;
    } else if (ctx.request.body.text === "count-all") {
        ctx.body = await showCoffeeCount(null);
        return;
    } else if (ctx.request.body.text === "stomach-pump") {
        ctx.body = await addCoffee(ctx.request.body.user_id, ctx.request.body.user_name, -1);
        return;
    } else if (!isNaN(parseInt(ctx.request.body.text, 10))) {
        ctx.body = await addCoffee(ctx.request.body.user_id, ctx.request.body.user_name, parseInt(ctx.request.body.text, 10));
        return;
    } else if (req.body.text === "") {
        ctx.body = await addCoffee(ctx.request.body.user_id, ctx.request.body.user_name, 1);
        return;
    } else {
        ctx.body = { "response_type": "ephemeral", "text": "I'm afraid I don't understand your command. Take another sip and try again." };
        return
    }
})

app.use(router.routes())
    .use(router.allowedMethods())

app.listen(3000, () => {
    console.log('running on port 3000');
    console.log({
        user: process.env.QOVERY_DATABASE_COFFEE_DB_USERNAME,
        host: process.env.QOVERY_DATABASE_COFFEE_DB_HOST,
        database: process.env.QOVERY_DATABASE_COFFEE_DB_DATABASE,
        password: process.env.QOVERY_DATABASE_COFFEE_DB_PASSWORD,
        port: process.env.QOVERY_DATABASE_COFFEE_DB_PORT
    });
});
