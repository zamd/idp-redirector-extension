module.exports = ` 
function denyIdPRedirectorAudienceForUserFlows(user, context, callback) {
  const IDP_REDIRECTOR_AUDIENCE = "##IDP_REDIRECTOR_AUDIENCE##";
  const requestedAudience =
    (context.request.body && context.request.body.audience) ||
    (context.request.query && context.request.query.audience);

  if (requestedAudience === IDP_REDIRECTOR_AUDIENCE) {
    return callback(
      new UnauthorizedError(
        \`\${IDP_REDIRECTOR_AUDIENCE} is not allowed for user oriented operations\`
      )
    );
  }

  callback(null, user, context);
}`;
