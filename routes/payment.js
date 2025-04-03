const { default: axios } = require("axios");
var express = require("express");
const moment = require("moment");
var router = express.Router();
const CryptoJS = require('crypto-js');

const config = {
  app_id: "2554",
  key1: "sdngKKJmqEMzvh5QQcdD2A9XBSKUNaYn",
  key2: "trMrHtvjo6myautxDUiAcYsVtaeQ8nhf",
  endpoint: "https://sb-openapi.zalopay.vn/v2/create",
};

router.post("/zalopay", async (req, res, next) => {
  try {
    const { sponsorAmount, urlCalbackSuccess, hostID, campName, donationMessage, fullName } =
      req.body;

    if (!sponsorAmount || !fullName) {
      return res.status(400).json({ error: "Missing data" });
    }

    const embed_data = {
      redirecturl: urlCalbackSuccess,
    };

    const items = {
        hostID,
        campName
    }

    const transID = Math.floor(Math.random() * 1000000);

    const order = {
      app_id: config.app_id, 
      app_trans_id: `${moment().format("YYMMDD")}_${transID}`, 
      app_user: fullName, 
      app_time: Date.now(), 
      item: JSON.stringify(items), 
      embed_data: JSON.stringify(embed_data),
      amount: sponsorAmount,
      description: donationMessage,
      bank_code: "",
      callback_url: "https://project3-pma1011-backend-1.onrender.com/payments/zalopayCallback",
    };

    const data =
      config.app_id +
      "|" +
      order.app_trans_id +
      "|" +
      order.app_user +
      "|" +
      order.amount +
      "|" +
      order.app_time +
      "|" +
      order.embed_data +
      "|" +
      order.item;
    order.mac = CryptoJS.HmacSHA256(data, config.key1).toString();

    const orderResponse = await axios.post(config.endpoint, null, {
      params: order,
    });
    if (orderResponse.status !== 200 || !orderResponse.data) {
      console.error("Error from ZaloPay:", orderResponse.data);
      return res.status(400).json({ data: orderResponse.data.message });
    }
    return res.status(200).json({ data: orderResponse.data });
  } catch (error) {
    console.error(error);
    return res.status(400).json({ data: "System error" });
  }
});

router.post("/zalopayCallback", async (req, res) => {
  let result = {};
  try {
    const { data: dataStr, mac: reqMac } = req.body;

    if (!dataStr || !reqMac) {
      return res.status(400).json({ error: "Invalid callback data: missing callback data" });
    }

    console.log(dataStr)
    console.log("mac 1 =", reqMac)

    let mac = CryptoJS.HmacSHA256(dataStr, config.key2).toString();
    console.log("mac 2=", mac);

    if (reqMac !== mac) {
      result.return_code = -1;
      result.return_message = "mac not equal";
    } else {
      let dataJson = JSON.parse(dataStr);
      console.log(dataJson)

      let data = JSON.parse(dataJson.item);
      console.log(data)

      console.log(
        "\n update order's status = success where app_trans_id =",
        dataJson["app_trans_id"]
      );
      result.return_code = 1;
      result.return_message = "success";
    }
  } catch (ex) {
    result.return_code = 0;
    result.return_message = ex.message;
  }

  res.json(result);
});

module.exports = router;
