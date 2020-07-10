module.exports = {
  api: {
    update_conflict: "AE001",
    invalid_schema: "AE002",
    invalid_allowlist: "AE003",
    bad_error_page: "AE004",
    missing_error_page: "AE005"
  },
  internal: {
    error_page_not_configured: "IE001",
    could_not_update_storage: "IE002",
    failed_fetching_error_page: "IE003"
  },
  redirect: {
    missing_state: "RE001",
    state_invalid_host: "RE002",
    state_did_not_match_pattern: "RE003",
    state_must_be_url: "RE004",
    bad_id_token: "RE005",
    forwarding_errors: "RE006"
  }
};
