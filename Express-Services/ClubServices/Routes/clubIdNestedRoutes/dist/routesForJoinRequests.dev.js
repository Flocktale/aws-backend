"use strict";

var router = require('express').Router();

var Joi = require('joi');

var _require = require('../../Schemas/Audience'),
    AudienceSchemaWithDatabaseKeys = _require.AudienceSchemaWithDatabaseKeys,
    AudienceSchema = _require.AudienceSchema;

var _require2 = require('../../Schemas/AtomicCountSchemas'),
    CountParticipantSchema = _require2.CountParticipantSchema,
    CountJoinRequestSchema = _require2.CountJoinRequestSchema;

var _require3 = require('../../config'),
    audienceDynamicDataIndex = _require3.audienceDynamicDataIndex,
    dynamoClient = _require3.dynamoClient,
    tableName = _require3.tableName; // required
// headers - "lastevaluatedkey"  (optional)


router.get('/', function _callee(req, res) {
  var clubId, query;
  return regeneratorRuntime.async(function _callee$(_context) {
    while (1) {
      switch (_context.prev = _context.next) {
        case 0:
          clubId = req.clubId;
          query = {
            TableName: tableName,
            IndexName: audienceDynamicDataIndex,
            Limit: 30,
            KeyConditions: {
              "P_K": {
                "ComparisonOperator": "EQ",
                "AttributeValueList": ["CLUB#".concat(clubId)]
              },
              "AudienceDynamicField": {
                "ComparisonOperator": "BEGINS_WITH",
                "AttributeValueList": ["ActiveJoinRequest#"]
              }
            },
            AttributesToGet: ['audience', 'joinRequestAttempts', 'timestamp'],
            ScanIndexForward: false,
            ReturnConsumedCapacity: "INDEXES"
          };

          if (req.headers.lastevaluatedkey) {
            query['ExclusiveStartKey'] = JSON.parse(req.headers.lastevaluatedkey);
          }

          dynamoClient.query(query, function (err, data) {
            if (err) res.status(404).json(err);else {
              console.log(data);
              res.status(200).json({
                "activeJoinRequestUsers": data["Items"],
                'lastevaluatedkey': data["LastEvaluatedKey"]
              });
            }
          });

        case 4:
        case "end":
          return _context.stop();
      }
    }
  });
}); //required
// query parameters - "userId"

router.post('/', function _callee2(req, res) {
  var clubId, audienceId, audienceDoc, _audienceDocQuery, newTimestamp, result, _audienceUpdateQuery, counterDoc, _counterUpdateQuery, _transactQuery;

  return regeneratorRuntime.async(function _callee2$(_context2) {
    while (1) {
      switch (_context2.prev = _context2.next) {
        case 0:
          // There is no seperate schema for join requests, instead we use AudienceDynamicField
          clubId = req.clubId;
          audienceId = req.query.userId;

          if (audienceId) {
            _context2.next = 5;
            break;
          }

          res.status(400).json('audienceId is required');
          return _context2.abrupt("return");

        case 5:
          _context2.prev = 5;
          // fetching audience info for this club
          _audienceDocQuery = {
            TableName: tableName,
            Key: {
              P_K: "CLUB#".concat(clubId),
              S_K: "AUDIENCE#".concat(audienceId)
            },
            AttributesToGet: ['clubId', 'isParticipant', 'joinRequested', 'joinRequestAttempts', 'audience', 'timestamp']
          };
          _context2.next = 9;
          return regeneratorRuntime.awrap(dynamoClient.get(_audienceDocQuery).promise());

        case 9:
          audienceDoc = _context2.sent['Item'];

          if (audienceDoc) {
            _context2.next = 13;
            break;
          }

          res.status(404).json("This user doesn't exist as audience");
          return _context2.abrupt("return");

        case 13:
          _context2.next = 20;
          break;

        case 15:
          _context2.prev = 15;
          _context2.t0 = _context2["catch"](5);
          console.log("This user doesn't exist as audience, completed with error: ", _context2.t0);
          res.status(404).json("This user doesn't exist as audience, function completed with error");
          return _context2.abrupt("return");

        case 20:
          _context2.prev = 20;

          if (!(audienceDoc.isPartcipant === true)) {
            _context2.next = 26;
            break;
          }

          //  conflict (409) since user is already a partcipant.
          res.status(409).json('User is already a participant');
          return _context2.abrupt("return");

        case 26:
          if (!(audienceDoc.joinRequested === true)) {
            _context2.next = 29;
            break;
          }

          //  conflict (409) since user already have an active join request.
          res.status(409).json('Join request is already pending!');
          return _context2.abrupt("return");

        case 29:
          // Now, this is the fresh request!!!
          newTimestamp = Date.now();
          audienceDoc['joinRequested'] = true;
          audienceDoc['timestamp'] = newTimestamp;
          _context2.next = 34;
          return regeneratorRuntime.awrap(AudienceSchemaWithDatabaseKeys.validateAsync(audienceDoc));

        case 34:
          result = _context2.sent;
          _audienceUpdateQuery = {
            TableName: tableName,
            Key: {
              P_K: result.P_K,
              S_K: result.S_K
            },
            UpdateExpression: 'set joinRequested = :request, AudienceDynamicField = :dynamicField, joinRequestAttempts = joinRequestAttempts + :counter',
            ExpressionAttributeValues: {
              ':request': true,
              ':dynamicField': result.AudienceDynamicField,
              ':counter': 1
            }
          };
          _context2.next = 38;
          return regeneratorRuntime.awrap(CountJoinRequestSchema.validateAsync({
            clubId: clubId
          }));

        case 38:
          counterDoc = _context2.sent;
          _counterUpdateQuery = {
            TableName: tableName,
            Key: {
              P_K: counterDoc.P_K,
              S_K: counterDoc.S_K
            },
            UpdateExpression: 'set #cnt = #cnt + :counter',
            ExpressionAttributeNames: {
              '#cnt': 'count'
            },
            ExpressionAttributeValues: {
              ':counter': 1
            }
          };
          _transactQuery = {
            TransactItems: [{
              Update: _audienceUpdateQuery
            }, {
              Update: _counterUpdateQuery
            }]
          };
          dynamoClient.transactWrite(_transactQuery, function (err, data) {
            if (err) res.status(404).json("Error in join request to club: ".concat(err));else {
              console.log(data);
              res.status(201).json('posted join request');
            }
          });
          _context2.next = 49;
          break;

        case 44:
          _context2.prev = 44;
          _context2.t1 = _context2["catch"](20);
          console.log(_context2.t1);
          res.status(400).json(_context2.t1);
          return _context2.abrupt("return");

        case 49:
        case "end":
          return _context2.stop();
      }
    }
  }, null, null, [[5, 15], [20, 44]]);
}); //required
// query parameters - "userId"

router["delete"]('/', function _callee3(req, res) {
  var clubId, audienceId, _audienceUpdateQuery;

  return regeneratorRuntime.async(function _callee3$(_context3) {
    while (1) {
      switch (_context3.prev = _context3.next) {
        case 0:
          // we don't decrement counter for join requests because it does not account for unique requests.
          clubId = req.clubId;
          audienceId = req.query.userId;

          if (audienceId) {
            _context3.next = 5;
            break;
          }

          res.status(400).json('audienceId is required');
          return _context3.abrupt("return");

        case 5:
          _audienceUpdateQuery = {
            TableName: tableName,
            Key: {
              P_K: "CLUB#".concat(clubId),
              S_K: "AUDIENCE#".concat(audienceId)
            },
            ConditionExpression: ' joinRequested = :tr ',
            UpdateExpression: 'SET joinRequested = :fal REMOVE AudienceDynamicField',
            ExpressionAttributeValues: {
              ':tr': true,
              ':fal': false
            }
          };
          dynamoClient.update(_audienceUpdateQuery, function (err, data) {
            if (err) res.status(404).json("Error in deleting join request: ".concat(err));else {
              console.log(data);
              res.status(202).json('Deleted join request');
            }
          });

        case 7:
        case "end":
          return _context3.stop();
      }
    }
  });
}); // query parameters - "audienceId", "action"

router.post('/response', function _callee4(req, res) {
  var clubId, requestAction, audienceId, _schema, audienceDoc, _audienceDocQuery, newTimestamp, result, _audienceUpdateQuery, counterDoc, _counterUpdateQuery, _transactQuery, _audienceUpdateQuery2;

  return regeneratorRuntime.async(function _callee4$(_context4) {
    while (1) {
      switch (_context4.prev = _context4.next) {
        case 0:
          clubId = req.clubId;
          requestAction = req.query.action;
          audienceId = req.query.audienceId;

          if (audienceId) {
            _context4.next = 6;
            break;
          }

          res.status(400).json('audienceId is required');
          return _context4.abrupt("return");

        case 6:
          _context4.prev = 6;
          _schema = Joi.string().valid('accept', 'cancel').required();
          _context4.next = 10;
          return regeneratorRuntime.awrap(_schema.validateAsync(requestAction));

        case 10:
          _context4.next = 16;
          break;

        case 12:
          _context4.prev = 12;
          _context4.t0 = _context4["catch"](6);
          res.status(400).json('invalid response , valid => accept or cancel');
          return _context4.abrupt("return");

        case 16:
          _context4.prev = 16;
          // fetching audience info for this club
          _audienceDocQuery = {
            TableName: tableName,
            Key: {
              P_K: "CLUB#".concat(clubId),
              S_K: "AUDIENCE#".concat(audienceId)
            },
            AttributesToGet: ['joinRequested', 'audience', 'timestamp']
          };
          _context4.next = 20;
          return regeneratorRuntime.awrap(dynamoClient.get(_audienceDocQuery).promise());

        case 20:
          audienceDoc = _context4.sent['Item'];

          if (audienceDoc) {
            _context4.next = 24;
            break;
          }

          res.status(404).json("This user doesn't exist as audience");
          return _context4.abrupt("return");

        case 24:
          _context4.next = 31;
          break;

        case 26:
          _context4.prev = 26;
          _context4.t1 = _context4["catch"](16);
          console.log("This user doesn't exist as audience, completed with error: ", _context4.t1);
          res.status(404).json("This user doesn't exist as audience, function completed with error");
          return _context4.abrupt("return");

        case 31:
          if (!(audienceDoc.joinRequested !== true)) {
            _context4.next = 34;
            break;
          }

          res.status(404).json("This user has no active join request.");
          return _context4.abrupt("return");

        case 34:
          if (!(requestAction === 'accept')) {
            _context4.next = 60;
            break;
          }

          newTimestamp = Date.now();
          audienceDoc['joinRequested'] = false;
          audienceDoc['isPartcipant'] = true;
          audienceDoc['timestamp'] = newTimestamp;
          audienceDoc['clubId'] = clubId;
          _context4.prev = 40;
          _context4.next = 43;
          return regeneratorRuntime.awrap(AudienceSchemaWithDatabaseKeys.validateAsync(audienceDoc));

        case 43:
          result = _context4.sent;
          _context4.next = 51;
          break;

        case 46:
          _context4.prev = 46;
          _context4.t2 = _context4["catch"](40);
          console.log(_context4.t2);
          res.status(500).json(_context4.t2);
          return _context4.abrupt("return");

        case 51:
          _audienceUpdateQuery = {
            TableName: tableName,
            Key: {
              P_K: result.P_K,
              S_K: result.S_K
            },
            UpdateExpression: 'SET joinRequested = :fal, AudienceDynamicField = :adf, isPartcipant = :tr',
            ExpressionAttributeValues: {
              ':fal': false,
              ':tr': true,
              ':adf': result.AudienceDynamicField
            }
          };
          _context4.next = 54;
          return regeneratorRuntime.awrap(CountParticipantSchema.validateAsync({
            clubId: clubId
          }));

        case 54:
          counterDoc = _context4.sent;
          _counterUpdateQuery = {
            TableName: tableName,
            Key: {
              P_K: counterDoc.P_K,
              S_K: counterDoc.S_K
            },
            UpdateExpression: 'set #cnt = #cnt + :counter',
            //incrementing
            ExpressionAttributeNames: {
              '#cnt': 'count'
            },
            ExpressionAttributeValues: {
              ':counter': 1
            }
          };
          _transactQuery = {
            TransactItems: [{
              Update: _audienceUpdateQuery
            } // { Update: _counterUpdateQuery }
            ]
          };
          dynamoClient.transactWrite(_transactQuery, function (err, data) {
            if (err) res.status(404).json("Error accepting join request: ".concat(err));else {
              console.log(data);
              res.status(201).json('Accepted join request');
            }
            return;
          });
          _context4.next = 67;
          break;

        case 60:
          if (!(requestAction === 'cancel')) {
            _context4.next = 65;
            break;
          }

          _audienceUpdateQuery2 = {
            TableName: tableName,
            Key: {
              P_K: "CLUB#".concat(clubId),
              S_K: "AUDIENCE#".concat(audienceId)
            },
            UpdateExpression: 'SET joinRequested = :fal REMOVE AudienceDynamicField',
            ExpressionAttributeValues: {
              ':fal': false
            }
          };
          dynamoClient.update(_audienceUpdateQuery2, function (err, data) {
            if (err) res.status(404).json("Error in cancelling join request: ".concat(err));else {
              console.log(data);
              res.status(202).json('Cancelled join request');
            }
          });
          _context4.next = 67;
          break;

        case 65:
          res.status(501).json('request has hit a dead end');
          return _context4.abrupt("return");

        case 67:
        case "end":
          return _context4.stop();
      }
    }
  }, null, null, [[6, 12], [16, 26], [40, 46]]);
});
module.exports = router;