'use strict';

const apiKey = require('../models/api-key.js');
const encryption = require('../helpers/encryption.js');
const response = require('../helpers/response.js');
const u2f = require('u2f');
const uuid = require('uuid');

module.exports.createAuthentication = (apiKeyValue, apiSecret, u2fUuid, callback) => {
  console.log('Starting create U2F authentication for uuid: ' + u2fUuid);
  apiKey.getActivatedApiKey(apiKeyValue, apiSecret, (error, apiKeyRecord) => {
    if (error) {
      console.log('Unable to get activated API Key in order to create U2F:', error);
      response.returnError(401, 'Unauthorized', callback);
      return;
    }

    if (!u2fUuid) {
      console.log('U2F delete request had no UUID.');
      response.returnError(401, 'Unauthorized', callback);
      return;
    }

    if (!apiKeyRecord.u2f || !apiKeyRecord.u2f[u2fUuid]) {
      console.log('API Key has no such U2F uuid.');
      response.returnError(404, 'No U2F entry found with that uuid for that API Key.', callback);
      return;
    }

    const encryptedAppId = apiKeyRecord.u2f[u2fUuid].encryptedAppId;
    if (!encryptedAppId) {
      console.error('No encryptedAppId found in that U2F record.');
      response.returnError(500, 'Internal Server Error', callback);
      return;
    }

    encryption.decrypt(encryptedAppId, apiSecret, (error, appId) => {
      if (error) {
        console.error('Error validating AppId', error);
        response.returnError(500, 'Internal Server Error', callback);
        return;
      }

      const encryptedKeyHandle = apiKeyRecord.u2f[u2fUuid].encryptedKeyHandle;
      if (!encryptedKeyHandle) {
        console.error('No encryptedKeyHandle found in that U2F record.');
        response.returnError(500, 'Internal Server Error', callback);
        return;
      }

      encryption.decrypt(encryptedKeyHandle, apiSecret, (error, keyHandle) => {
        if (error) {
          console.error('Error validating KeyHandle', error);
          response.returnError(500, 'Internal Server Error', callback);
          return;
        }

        const authRequest = u2f.request(appId, keyHandle);

        apiKeyRecord.u2f[u2fUuid].encryptedAuthenticationRequest = encryption.encrypt(JSON.stringify(authRequest), apiSecret);
        apiKey.updateApiKeyRecord(apiKeyRecord, (error) => {
          if (error) {
            console.error('Failed to create new U2F authentication request.', error);
            response.returnError(500, 'Internal Server Error', callback);
            return;
          }

          const apiResponse = {
            'uuid': u2fUuid,
            'version': authRequest.version,
            'challenge': authRequest.challenge,
            'appId': appId,
            'keyHandle': keyHandle
          };

          console.log("Successfully created U2F authentication for uuid: " + u2fUuid);
          response.returnSuccess(apiResponse, callback);
          return;
        });

      });

    });
  });
};

module.exports.createRegistration = (apiKeyValue, apiSecret, {appId} = {}, callback) => {
  console.log('Begin creating U2F registration for uuid: ' + u2fUuid);
  apiKey.getActivatedApiKey(apiKeyValue, apiSecret, (error, apiKeyRecord) => {
    if (error) {
      console.log('Unable to get activated API Key in order to create U2F:', error);
      response.returnError(401, 'Unauthorized', callback);
      return;
    }

    const registrationRequest = u2f.request(appId);

    var u2fUuid = uuid.v4();
    apiKeyRecord.u2f = apiKeyRecord.u2f || {};
    while (apiKeyRecord.u2f[u2fUuid]) {
      console.log('Initial UUID was already in use. Generating a new one.');
      u2fUuid = uuid.v4();
    }
    apiKeyRecord.u2f[u2fUuid] = {
      'encryptedAppId': encryption.encrypt(appId, apiSecret),
      'encryptedRegistrationRequest': encryption.encrypt(JSON.stringify(registrationRequest), apiSecret)
    };
    apiKey.updateApiKeyRecord(apiKeyRecord, (error) => {
      if (error) {
        console.error('Failed to create new U2F entry.', error);
        response.returnError(500, 'Internal Server Error', callback);
        return;
      }

      const apiResponse = {
        'uuid': u2fUuid,
        'challenge': registrationRequest
      };

      console.log('Successfully created U2F registration for uuid: ' + u2fUuid);
      response.returnSuccess(apiResponse, callback);
      return;
    });
  });
};

module.exports.delete = (apiKeyValue, apiSecret, u2fUuid, callback) => {
  console.log('Begin deleting U2F for uuid: ' + u2fUuid);
  apiKey.getActivatedApiKey(apiKeyValue, apiSecret, (error, apiKeyRecord) => {
    if (error) {
      console.log('Unable to get activated API Key in order to delete U2F:', error);
      response.returnError(401, 'Unauthorized', callback);
      return;
    }

    if (!u2fUuid) {
      console.log('U2F delete request had no UUID.');
      response.returnError(401, 'Unauthorized', callback);
      return;
    }

    if (!apiKeyRecord.u2f || !apiKeyRecord.u2f[u2fUuid]) {
      console.log('API Key has no such U2F uuid.');
      response.returnError(404, 'No U2F entry found with that uuid for that API Key.', callback);
      return;
    }

    delete apiKeyRecord.u2f[u2fUuid];

    apiKey.updateApiKeyRecord(apiKeyRecord, (error) => {
      if (error) {
        console.error('Error while deleting U2F entry.', error);
        response.returnError(500, 'Internal Server Error', callback);
        return;
      }

      console.log('Successfully deleted U2F for uuid: ' + u2fUuid);
      response.returnSuccess(null, callback);
      return;
    });
  });
};

module.exports.validateAuthentication = (apiKeyValue, apiSecret, u2fUuid, {signResult} = {}, callback) => {
  console.log('Begin validating authentication for uuid: ' + u2fUuid);
  apiKey.getActivatedApiKey(apiKeyValue, apiSecret, (error, apiKeyRecord) => {
    if (error) {
      console.log('Unable to get activated API Key in order to validate U2F authentication:', error);
      response.returnError(401, 'Unauthorized', callback);
      return;
    }

    if (!u2fUuid) {
      console.log('U2F validate authentication request had no UUID.');
      response.returnError(401, 'Unauthorized', callback);
      return;
    }

    if (!apiKeyRecord.u2f || !apiKeyRecord.u2f[u2fUuid]) {
      console.log('API Key has no such U2F uuid.');
      response.returnError(404, 'No U2F entry found with that uuid for that API Key.', callback);
      return;
    }

    const encryptedAuthenticationRequest = apiKeyRecord.u2f[u2fUuid].encryptedAuthenticationRequest;
    if (!encryptedAuthenticationRequest) {
      console.error('No encryptedAuthenticationRequest found in that U2F record.');
      response.returnError(500, 'Internal Server Error', callback);
      return;
    }

    encryption.decrypt(encryptedAuthenticationRequest, apiSecret, (error, authenticationRequest) => {
      if (error) {
        console.error('Error validating authenticationRequest', error);
        response.returnError(500, 'Internal Server Error', callback);
        return;
      }

      const encryptedPublicKey = apiKeyRecord.u2f[u2fUuid].encryptedPublicKey;
      if (!encryptedPublicKey) {
        console.error('No encryptedPublicKey found in that U2F record.');
        response.returnError(500, 'Internal Server Error', callback);
        return;
      }

      encryption.decrypt(encryptedPublicKey, apiSecret, (error, publicKey) => {
        const result = u2f.checkSignature(JSON.parse(authenticationRequest), JSON.parse(signResult), publicKey);
        if (result.errorMessage) {
          console.error('Error validating U2F authentication. Error: ' + result.errorMessage);
          response.returnError(400, result.errorMessage, callback);
          return;
        }

        apiKeyRecord.u2f[u2fUuid].encryptedAuthenticationRequest = ' ';
        apiKey.updateApiKeyRecord(apiKeyRecord, (error) => {
          if (error) {
            console.error('Unable to unset encryptedAuthenticationRequest after successful authentication');
            response.returnError(500, 'Internal Server Error', callback);
            return;
          }

          console.log('Successfully validated U2F authentication for uuid: ' + u2fUuid);
          response.returnSuccess({'message': 'Valid', 'status': 200}, callback);
          return;
        });

      });

    });

  });

};

module.exports.validateRegistration = (apiKeyValue, apiSecret, u2fUuid, {signResult} = {}, callback) => {
  console.log('Begin validating registration for uuid: ' + u2fUuid);
  apiKey.getActivatedApiKey(apiKeyValue, apiSecret, (error, apiKeyRecord) => {
    if (error) {
      console.log('Unable to get activated API Key in order to validate U2F authentication:', error);
      response.returnError(401, 'Unauthorized', callback);
      return;
    }

    if (!u2fUuid) {
      console.log('U2F validate authentication request had no UUID.');
      response.returnError(401, 'Unauthorized', callback);
      return;
    }

    if (!apiKeyRecord.u2f || !apiKeyRecord.u2f[u2fUuid]) {
      console.log('API Key has no such U2F uuid.');
      response.returnError(404, 'No U2F entry found with that uuid for that API Key.', callback);
      return;
    }

    const encryptedRegistrationRequest = apiKeyRecord.u2f[u2fUuid].encryptedRegistrationRequest;
    if (!encryptedRegistrationRequest) {
      console.error('No encryptedRegistrationRequest found in that U2F record.');
      response.returnError(500, 'Internal Server Error', callback);
      return;
    }

    encryption.decrypt(encryptedRegistrationRequest, apiSecret, (error, registrationRequest) => {
      if (error) {
        console.error('Error validating registrationRequest', error);
        response.returnError(500, 'Internal Server Error', callback);
        return;
      }

      const result = u2f.checkRegistration(JSON.parse(registrationRequest), signResult);
      if (result.errorMessage) {
        console.error('U2F check registration failed. Error: ' + result.errorMessage);
        response.returnError(500, 'Internal Server Error', callback);
        return;
      }

      apiKeyRecord.u2f[u2fUuid].encryptedRegistrationRequest = null;
      apiKeyRecord.u2f[u2fUuid].encryptedPublicKey = encryption.encrypt(result.publicKey, apiSecret);
      apiKeyRecord.u2f[u2fUuid].encryptedKeyHandle = encryption.encrypt(result.keyHandle, apiSecret);

      apiKey.updateApiKeyRecord(apiKeyRecord, (error) => {
        if (error) {
          console.error('Error while updating U2F entry after validating registration', error);
          response.returnError(500, 'Internal Server Error', callback);
          return;
        }

        console.log('Successfully validated U2F registration for uuid: ' + u2fUuid);
        response.returnSuccess(null, callback);
        return;
      });

    });

  });

};