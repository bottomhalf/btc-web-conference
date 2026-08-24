export const environment = {
  production: false,
  sfuBaseUrl: "www.confeet.com",
  appServerBaseUrl: "http://localhost:7801/api/",
  goApiGateway: "http://localhost:7815/v1/",
  socketBaseUrl: "ws://localhost:7815/v1/cfgs/cf-sesion",
  messageBaseUrl: "http://localhost:7815/v1/cf/api/",
  socketHandshakEndpoint: "ws",
  heartbeatInterval: 30000,
};

// export const environment = {
//   production: true,
//   sfuBaseUrl: "www.confeet.com",
//   appServerBaseUrl: `https://www.confeet.com/api/`,

//   socketBaseUrl: "wss://www.confeet.com/v1/cfgs/cf-sesion",
//   messageBaseUrl: "https://www.confeet.com/v1/cf/api/",
//   socketHandshakEndpoint: "ws",
//   heartbeatInterval: 30000,
// };