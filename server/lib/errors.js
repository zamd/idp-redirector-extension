module.exports = {
  api: {
    update_conflict: "AE001",
    invalid_schema: "AE002",
    invalid_whitelist: "AE003",
    bad_error_page: "AE004",
    missing_error_page: "AE005"
  },
  code_exchange: {
    forbidden: "CE001",
    missing_id_token: "CE002",
    internal: "CE003"
  },
  internal: {
    error_page_not_configured: "IE001",
    could_not_update_storage: "IE002"
  },
  redirect: {
    missing_state: "RE001",
    state_invalid_host: "RE002",
    state_did_not_match_pattern: "RE003",
    state_must_be_url: "RE004",
    user_exchange_failed: "RE005",
    forwarding_errors: "RE006",
    bad_id_token: "RE007"
  }
};
