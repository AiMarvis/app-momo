import { render } from "solid-js/web";

import App from "~/app";
import "~/index.css";

// oxlint-disable-next-line typescript/no-non-null-assertion -- root is guaranteed in index.
const root = document.getElementById("root")!;

render(() => <App />, root);
