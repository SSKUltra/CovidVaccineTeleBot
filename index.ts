const { Telegraf, Markup, session } = require('telegraf');
const axios = require("axios");
const fs = require("fs");
require('dotenv').config()

const bot = new Telegraf(process.env.TOKEN);
const host = "https://cdn-api.co-vin.in/api/v2";

const emoji = {
    Cash: '\u{1F4B8}',
}

const districtFileName = 'districts.json';
const districtDataFileName = 'districtsData.json';

bot.start((ctx) => {
    fetchState(ctx);
})

bot.hears('/add', (ctx) => {
    fetchState(ctx);
})

bot.use(session())

const fetchDistrict = async (ctx, stateId) => {
    try {
        await axios.get(`${host}/admin/location/districts/${stateId}`)
          .then((response) => getUserDistrict(ctx, response.data.districts))
    } catch (e) {
        console.log(e);
    }
}

const fetchState = async (ctx) => {
    try {
      await axios.get(`${host}/admin/location/states`)
        .then((response) => getUserState(ctx, response.data.states))
    } catch (e) {
      console.log(e);
    }
}

const requestAgeGroup = {
    "reply_markup": {
        "one_time_keyboard": true,
        "keyboard": [
            [{
                text: "18 to 45",
                one_time_keyboard: true,
            }],
            [{
                text: "45+",
                one_time_keyboard: true,
            }],
            [{
                text: "Both",
                one_time_keyboard: true,
            }],
            ["Cancel"]
        ]
    }
};

const generateUserData = (userName, districtId, ageGroup) => {
    return districtId ? 
    {
        userName: userName,
        districtId: [districtId],
        ageGroup: ageGroup,
    } : {
        userName: userName,
        districtId: [],
        ageGroup: ageGroup,
    }
}

const getAgeGroup = (ctx) => {
    bot.telegram.sendMessage(ctx.chat.id, 'Select the age group', requestAgeGroup)

    bot.hears('18 to 45', ctx => {
        bot.telegram.sendMessage(ctx.chat.id, 'Selected age group is 18 to 45', removeKeyboard);
        jsonAddDistrict(ctx, "lowerAge");
    })
    
    bot.hears('45+', ctx => {
        bot.telegram.sendMessage(ctx.chat.id, 'Selected age group is 45+', removeKeyboard);
        jsonAddDistrict(ctx, "upperAge");
    })
    
    bot.hears('Both', ctx => {
        bot.telegram.sendMessage(ctx.chat.id, 'Selected age group is both 18 to 45 and 45+', removeKeyboard);
        jsonAddDistrict(ctx, "bothAge");
    })  
}

const getUserDistrict = (ctx, districts) => {
    const requestDistrict = {
        reply_markup: {
            keyboard: districts.map((district) => {return [{ text: district.district_name }]})
        }
    }
    bot.telegram.sendMessage(ctx.chat.id, 'Select the District', requestDistrict)

    districts.forEach(district => {
        bot.hears(district.district_name, ctx => {
            ctx.session = { districtId: district.district_id };
            // jsonAddUser(ctx.from.id, userData);
            getAgeGroup(ctx);
        })
    });
}

const getUserState = (ctx, states) => {
    const requestState = {
        reply_markup: {
            keyboard: states.map((state) => {return [{ text: state.state_name }]})
        }
    }
    bot.telegram.sendMessage(ctx.chat.id, 'Select the State', requestState)

    states.forEach(state => {
        bot.hears(state.state_name, ctx => {
            fetchDistrict(ctx, state.state_id);
        })
    });
}

const removeKeyboard = {
    "reply_markup": {
        "remove_keyboard": true
    }
}

const replyParseMode = {
    "parse_mode": "MarkdownV2"
}

const getCurrentDate = () => {
    var now = new Date();
    var dd = String(now.getDate()).padStart(2, '0');
    var mm = String(now.getMonth() + 1).padStart(2, '0'); //January is 0!
    var yyyy = now.getFullYear();
    return  dd + '-' + mm + '-' + yyyy;
}

const generateCenterMessage = (centerData) => 
    `\`Name : ${centerData.name} \n` +
    `Minimum age : ${centerData.min_age_limit} \n` +
    `Available capacity : ${centerData.available_capacity} \n` + 
    `Block name : ${centerData.block_name} \n` +
    `Pin code : ${centerData.pincode} \n` +
    `Fee type : ${centerData.fee_type} \n` + 
    `Fee : ${centerData.fee} ${emoji.Cash}\n` + 
    `Vaccine type : ${centerData.vaccine} \n` + 
    `Date : ${centerData.date} \n` +
    `Slots : ${centerData.slots.map((slot) => `\n\t -> ${slot}`)} \n\``

const getDistrictDataFromFile = () => {
    const districtsFromFile = fs.readFileSync(districtDataFileName, { encoding: 'utf8' });
    return JSON.parse(districtsFromFile)
}

const getDistrictDataByIdFromFile = (districtId) => {
    const districtData = getDistrictDataFromFile();
    return districtData[districtId];
}

const sendDistrictDataToUserByAge = (ctx, districtData, ageGroup) => {
    districtData.sessions.map((session) => {
        if ((ageGroup === "upperAge" && session.min_age_limit === 45) || 
            (ageGroup === "lowerAge" && session.min_age_limit === 18) || 
            (ageGroup === "bothAge")) {
            bot.telegram.sendMessage(
                ctx.chat.id,
                generateCenterMessage(session),
                replyParseMode
            ) 
        }
    })

    if (districtData.sessions.length === 0 || 
        (ageGroup === "upperAge" && !districtData.sessions.find((session) => session.min_age_limit === 45)) ||
        (ageGroup === "lowerAge" && !districtData.sessions.find((session) => session.min_age_limit === 18))) {
        bot.telegram.sendMessage(ctx.chat.id, "There was no vaccination centers available for the parameters selected by you. I will update you once there are any changes in the availability (This bot is still in testing, please don't rely only on this bot for updates).");
    }
}

const setDistrictDataByIdToFile = (districtId, data) => {
    const districtData = getDistrictDataFromFile();
    const newDistrictData = { ...districtData, [districtId]: data }
    fs.writeFileSync(districtDataFileName, JSON.stringify(newDistrictData))
}

const fetchDistrictData = async (ctx, ageGroup, districtId) => {
    const districtDataById = getDistrictDataByIdFromFile(districtId);
    if (districtDataById) {
        sendDistrictDataToUserByAge(ctx, districtDataById, ageGroup);
        return;
    }
    
    const todayDateFormat = getCurrentDate();
    bot.telegram.sendMessage(ctx.chat.id, 'Here are all the available centers in your district:')
    console.log(`Fetching data for district : ${districtId}`);
    try {
        await axios.get(`${host}/appointment/sessions/public/findByDistrict?district_id=${districtId}&date=${todayDateFormat}`)
            .then((response) => {
                sendDistrictDataToUserByAge(ctx, response.data, ageGroup)
                setDistrictDataByIdToFile(districtId, response.data);
            })
    } catch (err) {
        console.log(err)
    }
}

const jsonAddDistrict = (ctx, ageGroup) => {
    try {
        const fileDistrictDataResponse = fs.readFileSync(districtFileName, { encoding: 'utf8' });
        const fileDistrictData = JSON.parse(fileDistrictDataResponse);

        const { districtId } = ctx.session;
        const userId = ctx.from.id;
        const newDistrictData = { ...fileDistrictData }
        if (!(districtId in newDistrictData)) {
            newDistrictData[districtId] = {
                lowerAge : [],
                upperAge : [],
                bothAge : [],
            }
        };

        if(newDistrictData[districtId][ageGroup].indexOf(userId) === -1) {
            newDistrictData[districtId][ageGroup].push(userId);
        }

        console.log(`Adding user : ${userId} to district : ${districtId}`)
        fs.writeFileSync(districtFileName, JSON.stringify(newDistrictData));
        fetchDistrictData(ctx, ageGroup, districtId);
    }
    catch (err) {
        console.log(err);
    }
}

const getUsersForDistrict = (districtId) => {
    const fileDistrictData = fs.readFileSync(districtFileName, { encoding: 'utf8' });
    const districtData = JSON.parse(fileDistrictData);

    return districtData[districtId]
}

const checkForUpdates = (districtId, oldData, newData) => {
    let updateData = false;
    const districtUserData = getUsersForDistrict(districtId);

    newData.sessions.forEach((newCenter) => {
        const { center_id } = newCenter;
        const oldCenter = oldData.sessions.find((oldCenter) => oldCenter.center_id === center_id)
        if ((oldCenter && (oldCenter.available_capacity !== newCenter.available_capacity || oldCenter.min_age_limit !== newCenter.min_age_limit)) || 
            !oldCenter) {
            updateData = true;
            if (districtUserData) {
                let usersToUpdate = [];
                districtUserData["bothAge"].forEach((user) => usersToUpdate.push(user));

                if ( newCenter.min_age_limit === 18) {
                    districtUserData["lowerAge"].forEach((user) => usersToUpdate.push(user))
                } else if ( newCenter.min_age_limit === 45) {
                    districtUserData["upperAge"].forEach((user) => usersToUpdate.push(user))
                }

                usersToUpdate.forEach((userId) => {
                    console.log(`Sending message to user : ${userId} for center : ${center_id}`)
                    bot.telegram.sendMessage(userId, generateCenterMessage(newCenter), replyParseMode)
                })
            }
        }
    })

    return updateData;
}

const getAllDistrictData = () => {
    const districtData = getDistrictDataFromFile();

    Object.keys(districtData).forEach(async (districtId) => {
        const todayDateFormat = getCurrentDate();
        try {
            await axios.get(`${host}/appointment/sessions/public/findByDistrict?district_id=${districtId}&date=${todayDateFormat}`)
            .then((response) => {
                const updateData = checkForUpdates(districtId, districtData[districtId], response.data)
                if (updateData) {
                    console.log(`Updating district data file for district : ${districtId}`)
                    setDistrictDataByIdToFile(districtId, response.data);
                }
            })
        } catch (e) {
            console.log(e);
        }
        
    })
}

const POLLING_INTERVAL = 5000;

const poll = async ({ fn, interval }) => {  
    const executePoll = async (resolve, reject) => {
        console.log("*****POLLING*****");
        const result = await fn();
        setTimeout(executePoll, interval, resolve, reject);
    }
  
    return new Promise(executePoll);
};

poll({fn: getAllDistrictData, interval: POLLING_INTERVAL});

bot.launch()
