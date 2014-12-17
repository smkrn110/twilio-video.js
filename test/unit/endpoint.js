'use strict';

var assert = require('assert');
var Q = require('q');

var _Endpoint = require('../../lib/endpoint');
var getToken = require('../token').getExpiredToken;
var Participant = require('../../lib/participant');
var Session = require('../../lib/session');
var UserAgent = require('../../lib/sip/useragent');

function Endpoint(token, options) {
  options = options || {};
  options['userAgent'] = UserAgent;
  return new _Endpoint(token, options);
}

describe('Endpoint', function() {
  var accountSid = process.env.ACCOUNT_SID;
  var authToken = process.env.AUTH_TOKEN;
  var address = 'alice@twil.io';
  var apiHost = process.env.API_HOST;

  var token = null;
  var endpoint = null;

  before(function(done) {
    getToken(accountSid, authToken, address, apiHost)
      .done(function(_token) {
        token = _token;
        done();
      }, done);
  });

  beforeEach(function() {
    endpoint = new Endpoint(token, {
      'userAgent': UserAgent
    });
  });

  afterEach(function() {
    Participant._reset();
    Session._reset();
  });

  it('constructor works', function() {
    assert.equal(address, endpoint.address);
  });

  it('#createSession works inviting self', function(done) {
    var session = createSession(endpoint, endpoint);
    allParticipantsJoined(session, endpoint, done);
  });

  it('#createSession works inviting address', function(done) {
    var address = 'bob@twil.io';
    var session = createSession(endpoint, address);
    allParticipantsJoined(session, [endpoint, address], done);
  });

  it('#createSession works inviting addresses', function(done) {
    var addresses = [
      'bob@twil.io',
      'charles@twil.io'
    ];
    var session = createSession(endpoint, addresses);
    allParticipantsJoined(session, [endpoint].concat(addresses), done);
  });

  it('#createSession works inviting Endpoint', function(done) {
    getToken(accountSid, authToken, 'bob@twil.io', apiHost)
      .done(function(token) {
        var endpoint2 = new Endpoint(token);
        var session = createSession(endpoint, endpoint2);
        allParticipantsJoined(session, [endpoint, endpoint2], done);
      }, done);
  });

  it('#createSession works inviting Endpoints', function(done) {
    // TODO(mroberts): Need to test using Endpoints with the same name.
    var tokens = [
      getToken(accountSid, authToken, 'bob@twil.io', apiHost),
      getToken(accountSid, authToken, 'charles@twil.io', apiHost)
    ];
    Q.all(tokens).done(function(tokens) {
      var endpoints = tokens.map(function(token) {
        return new Endpoint(token);
      });
      var session = createSession(endpoint, endpoints);
      allParticipantsJoined(session, [endpoint].concat(endpoints), done);
    }, done);
  });

  it('#createSession works inviting Participant', function(done) {
    var participant = new Participant('bob@twil.io');
    var session = createSession(endpoint, participant);
    allParticipantsJoined(session, [endpoint, participant], done);
  });

  it('#createSession works inviting Participants', function(done) {
    var participants = [
      new Participant('bob@twil.io'),
      new Participant('charles@twil.io')
    ];
    var session = createSession(endpoint, participants);
    allParticipantsJoined(session, [endpoint].concat(participants), done);
  });

  it('#createSession works inviting addresses, Endpoints, & Participants',
    function(done) {
      var participants = [
        new Endpoint(token),
        'bob@twil.io',
        new Participant('charles@twil.io')
      ];
      var session = createSession(endpoint, participants);
      allParticipantsJoined(session, [endpoint].concat(participants), done);
    }
  );

  it('#createSession works without participants', function(done) {
    var session = createSession(endpoint, []);
    allParticipantsJoined(session, endpoint, done);
  });

  it('#join works', function(done) {
    var session = new Session();
    endpoint.join(session);
    allParticipantsJoined(Q(session), endpoint, done);
  });

  it('#leave works', function(done) {
    var endpoint2 = new Endpoint(token);
    var session = createSession(endpoint, endpoint2);
    allParticipantsJoined(session, [endpoint, endpoint2], function(error, session) {
      if (error) {
        return done(error);
      }
      endpoint.leave(session);
      allParticipantsLeft(session, endpoint, done);
    });
  });

  function allParticipantsLeft(session, participants, done) {
    var finished = false;
    var n = (typeof participants === 'string' ||
             participants instanceof Participant) ? 1 : participants.length;
    session.on('participantLeft', function(participant) {
      try {
        sessionDoesNotContainParticipants(session, participant);
      } catch (e) {
        if (!finished) {
          finished = true;
          return done(e);
        }
      }
      if (--n === 0) {
        try {
          sessionDoesNotContainParticipants(session, participants);
        } catch (e) {
          return done(e);
        }
        done();
      }
    });
  }

  function allParticipantsJoined(session, participants, done) {
    session.done(function(session) {
      var finished = false;
      var n = (typeof participants === 'string' ||
               participants instanceof Participant) ? 1 : participants.length;
      session.on('participantJoined', function(participant) {
        try {
          sessionContainsParticipants(session, participant);
        } catch (e) {
          if (!finished) {
            finished = true;
            return done(e);
          }
        }
        if (--n === 0) {
          try {
            sessionContainsParticipants(session, participants);
          } catch (e) {
            return done(e);
          }
          done(null, session);
        }
      });
    }, done);
  }

  function createSession(endpoint, participants) {
    var session = endpoint.createSession(participants);
    // assert(session instanceof Session);
    // sessionContainsParticipants(session, participants);
    return session;
  }

  function sessionContainsParticipants(session, _participants) {
    _participants = _participants || [];
    _participants =
      typeof _participants === 'string' || _participants instanceof Participant
        ? [_participants] : _participants;
    var participants = session.participants;
    var participantAddresses = getParticipantAddresses(session);
    _participants.forEach(function(participant) {
      var present;
      if (typeof participant === 'string') {
        present = participantAddresses.has(participant);
      } else {
        present = participants.has(participant);
      }
      if (!present) {
        throw new Error('Participant "' +
          (participant.address || participant) + '" missing from Session');
      }
    });
  }

  function sessionDoesNotContainParticipants(session, _participants) {
    _participants = _participants || [];
    _participants =
      typeof _participants === 'string' || _participants instanceof Participant
        ? [_participants] : _participants;
    var participants = session.participants;
    var participantAddresses = getParticipantAddresses(session);
    _participants.forEach(function(participant) {
      var present;
      if (typeof participant === 'string') {
        present = participantAddresses.has(participant);
      } else {
        present = participants.has(participant);
      }
      if (present) {
        throw new Error('Participant "' +
          (participant.address || participant) + '" present in Session');
      }
    });
  }

  function getParticipantAddresses(session) {
    return session.participants.map(function(participant) {
      return participant.address;
    });
  }

});