import {createAsyncThunk, createSlice, PayloadAction} from '@reduxjs/toolkit'
import {handleException} from "../../common/actions/exception";
import explorer from "../../../utils/dappflow";
import {A_SearchAccount} from "../../../packages/core-sdk/types";

type AddressBookData = Record<string, string>;

interface AddressBook {
    data: AddressBookData,
    loading: boolean,
}

const initialState: AddressBook = {
    data: {},
    loading: false,
}

export const loadAddressBook = createAsyncThunk(
    'addressBook/loadAddressBook',
    async (_, thunkAPI) => {
        const {dispatch} = thunkAPI;
        try {
            dispatch(setLoading(true));
            const response = await fetch("https://flow.algo.surf/address-book.json");
            dispatch(setLoading(false));
            return await response.json();
        }
        catch (e: any) {
            dispatch(setLoading(false));
            dispatch(handleException(e));
        }
    }
);

export const addressBookSlice = createSlice({
    name: 'addressBook',
    initialState,
    reducers: {
        setLoading: (state, action: PayloadAction<boolean> ) => {
            state.loading = action.payload;
        },
    },
    extraReducers: (builder) => {
        builder.addCase(loadAddressBook.fulfilled, (state, action: PayloadAction<AddressBookData>) => {
            if (action.payload) {
                state.data = action.payload;
            }
        })
    },
});

export const { setLoading } = addressBookSlice.actions
export default addressBookSlice.reducer
