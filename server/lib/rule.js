module.exports = `
function denyAudienceForUserFlows_ClientAccessForNonSamlProtocol(user, context, callback) {
  const IDP_REDIRECTOR_AUDIENCE = "##IDP_REDIRECTOR_AUDIENCE##";
  const IDP_REDIRECTOR_CLIENT_NAME = "##EXTENSION_CLIENT_NAME##";

  const requestedAudience =
    (context.request.body && context.request.body.audience) ||
    (context.request.query && context.request.query.audience);
  const { clientName: requestingClient, protocol: requestedProtocol } = context;

  if (requestedAudience === IDP_REDIRECTOR_AUDIENCE) {
    return callback(
      new UnauthorizedError(
        \`\${IDP_REDIRECTOR_AUDIENCE} is not allowed for user oriented operations\`
      )
    );
  }

  //lock down extension access to only saml protocol 
  if (requestingClient === IDP_REDIRECTOR_CLIENT_NAME && requestedProtocol !== "samlp") {
    return callback(
      new UnauthorizedError(
        \`The \${IDP_REDIRECTOR_CLIENT_NAME} is only authorized for SAML logins.\`
      ));
  }

  callback(null, user, context);
}`;
