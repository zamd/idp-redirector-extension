module.exports = `<html lang="en">
  <head>
    <title>Auth0 - Idp Redirector</title>
    <meta charset="UTF-8" />
    <meta http-equiv="X-UA-Compatible" content="IE=Edge" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link
      rel="shortcut icon"
      href="https://cdn.auth0.com/styleguide/4.6.13/lib/logos/img/favicon.png"
    />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link
      rel="stylesheet"
      type="text/css"
      href="https://cdn.auth0.com/styles/zocial.min.css"
    />
    <link
      rel="stylesheet"
      type="text/css"
      href="https://cdn.auth0.com/manage/v0.3.1715/css/index.min.css"
    />
    <link
      rel="stylesheet"
      type="text/css"
      href="https://cdn.auth0.com/styleguide/4.6.13/index.css"
    />
  </head>
  <body>
    <div id="app">
      <div>
        <header class="dashboard-header">
          <nav role="navigation" class="navbar navbar-default">
            <div class="container">
              <div class="navbar-header">
                <h1 class="navbar-brand" style="padding-top: 0px;">
                  <a href="https://manage.auth0.com"><span>Auth0</span></a>
                </h1>
              </div>
              <div id="navbar-collapse" class="collapse navbar-collapse">
                <ul class="nav navbar-nav navbar-right">
                  <li>
                    <a target="_blank" href="https://auth0.com/support"
                      >Help &amp; Support</a
                    >
                  </li>
                  <li>
                    <a target="_blank" href="https://auth0.com/docs/extensions"
                      >Documentation</a
                    >
                  </li>
                </ul>
              </div>
            </div>
          </nav>
        </header>
        <div class="container">
          <div class="row">
            <div class="col-xs-12">
              <div class="row">
                <div class="col-xs-12">
                  <h1 class="pull-left" style="padding-top: 10px;">
                    Idp Redirector
                  </h1>
                </div>
              </div>
              <div class="row">
                <div class="col-xs-12">
                  <div id="content-area" class="tab-content">
                    <div id="instructions" class="tab-pane active">
                      <h2>
                        <span class="icon icon-budicon-546 icon--21pJH"></span>
                        API
                      </h2>
                      <%if(identifier){%>
                      <p><strong><%=identifier%></strong></span> configured.</p>
                      <%}else{%>
                        <p>API not configured.</p>
                      <%}%>

                      <h2>Client</h2>
                      <%if(client_id){%>
                        <p>CI/CD Client <strong><%=client_id%></strong> configured and authorized.</p>
                      <%}else{%>
                        <p>Client not configured.</p
                      <%}%>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </body>
</html>`;
