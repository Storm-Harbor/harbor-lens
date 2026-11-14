package contracts_test

import (
	"encoding/json"
	"os/exec"
	"testing"

	recovery "github.com/Storm-Harbor/storm-lib-recovery-contracts"
)

func TestBrowserDraftsMatchPublishedRecoveryContract(t *testing.T) {
	output, err := exec.Command("node", "export.mjs").Output()
	if err != nil {
		t.Fatalf("export synthetic browser drafts: %v", err)
	}
	var drafts []struct {
		Name  string `json:"name"`
		Scope string `json:"scope"`
		YAML  string `json:"yaml"`
	}
	if err := json.Unmarshal(output, &drafts); err != nil {
		t.Fatalf("decode exported drafts: %v", err)
	}
	if len(drafts) < 9 {
		t.Fatal("missing provider, purpose, provisioning or region variants")
	}
	for _, draft := range drafts {
		t.Run(draft.Name, func(t *testing.T) {
			if draft.Scope != "demo-atlas" && draft.Scope != "demo-orbit" {
				t.Fatal("unexpected synthetic project")
			}
			// This is an independent fixture expectation, not an authenticated
			// identity or a scope inferred from the YAML under validation.
			expected := recovery.Scope{OrganizationID: "demo-organization", ProjectID: draft.Scope}
			if _, err := recovery.DecodeYAML([]byte(draft.YAML), expected); err != nil {
				t.Fatalf("browser draft violates published contract: %v", err)
			}
		})
	}
	t.Logf("validated %d browser drafts against published SDK v0.1.0-alpha.1", len(drafts))
}
