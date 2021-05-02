const { Telegraf, Markup } = require('telegraf');
const axios = require("axios");
const fs = require("fs");
require('dotenv').config()

const bot = new Telegraf(process.env.TOKEN);
const host = "https://cdn-api.co-vin.in/api/v2";

bot.start((ctx) => {
    fetchState(ctx);
})

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
        const userData = generateUserData(ctx.from.username, undefined, "lowerAge");
        jsonAddUser(ctx.from.id, userData);
    })
    
    bot.hears('45+', ctx => {
        bot.telegram.sendMessage(ctx.chat.id, 'Selected age group is 45+', removeKeyboard);
        const userData = generateUserData(ctx.from.username, undefined, "UpperAge");
        jsonAddUser(ctx.from.id, userData);
    })
    
    bot.hears('Both', ctx => {
        bot.telegram.sendMessage(ctx.chat.id, 'Selected age group is both 18 to 45 and 45+', removeKeyboard);
        const userData = generateUserData(ctx.from.username, undefined, "BothAge");
        jsonAddUser(ctx.from.id, userData);
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
            console.log(`getUserDistrict: ${district.district_id}`);
            const userData = generateUserData(ctx.from.username, district.district_id, '');
            jsonAddUser(ctx.from.id, userData);
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

const jsonAddUser = (id, data) => {
    try {
        const fileUserDataResponse = fs.readFileSync('users.json', { encoding: 'utf8' });
        const fileUserData = JSON.parse(fileUserDataResponse);

        if (id in fileUserData) {
            fileUserData[id].districtId.forEach((districtId) => {
                if(data.districtId.indexOf(districtId) === -1) {
                    data.districtId.push(districtId)}
                }
            )
        } 

        const newUserData = { ...fileUserData, [id]: { ...data } }

        fs.writeFileSync('users.json', JSON.stringify(newUserData));
    }
    catch(err) {
        console.log(err)
    }
}

bot.launch()