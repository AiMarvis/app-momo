pub const READ_FILE: &str = "builtin.read_file";
pub const LIST_FILES: &str = "builtin.list_files";
pub const SEARCH_VAULT: &str = "builtin.search_vault";
pub const CREATE_FILE: &str = "builtin.create_file";
pub const EDIT_FILE: &str = "builtin.edit_file";
pub const DELETE_FILE: &str = "builtin.delete_file";
pub const MOVE_FILE: &str = "builtin.move_file";
pub const GET_OUTLINE: &str = "builtin.get_outline";
pub const GET_TAGS: &str = "builtin.get_tags";

pub fn canonical_builtin_tool_id(name: &str) -> String {
    match name {
        "read_file" => READ_FILE,
        "list_files" => LIST_FILES,
        "search_vault" => SEARCH_VAULT,
        "create_file" => CREATE_FILE,
        "edit_file" => EDIT_FILE,
        "delete_file" => DELETE_FILE,
        "move_file" => MOVE_FILE,
        "get_outline" => GET_OUTLINE,
        "get_tags" => GET_TAGS,
        _ => return format!("builtin.{name}"),
    }
    .to_string()
}
