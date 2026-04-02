export const AVAILABLE_COLUMNS = [
    { id: 'regulation', label: 'Regulation', field: 'Regulation' },
    { id: 'asset_class', label: 'Asset Class', field: 'AssetClass' },
    { id: 'control_type', label: 'Control Type', field: 'Control Type' },
    { id: 'data_type', label: 'Data Type', field: 'Data Type' },
    { id: 'sub_control_type', label: 'Sub-Control Type', field: 'Sub-ControlType' },
    { id: 'remediation_status', label: 'Remediation Status', field: 'RemediationStatus' },
    { id: 'explain_issue', label: 'ExplainIssue', field: 'ExplainIssue' },
    { id: 'explain_issue_notification', label: 'ExplainIssueNotification', field: 'ExplainIssueNotification' },
    { id: 'explain_issue_detail', label: 'ExplainIssueDetail', field: 'ExplainIssueDetail' }
];

export const DETAIL_FILTER_KEYS = {
    Regulation: 'regulation',
    AssetClass: 'asset_class',
    'Control Type': 'control_type',
    'Data Type': 'data_type',
    'Sub-ControlType': 'sub_control_type',
    RemediationStatus: 'remediation_status',
    ExplainIssue: 'explain_issue',
    ExplainIssueNotification: 'explain_issue_notification',
    ExplainIssueDetail: 'explain_issue_detail'
};
